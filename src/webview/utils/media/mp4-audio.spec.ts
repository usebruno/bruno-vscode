import { isDecodableAacTrack, parseMp4AudioTrack, type Mp4AudioTrack } from './mp4-audio';

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const u32 = (value: number) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
};

const i32 = (value: number) => {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setInt32(0, value);
  return out;
};

const u16 = (value: number) => {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value);
  return out;
};

const u64 = (value: number) => {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value));
  return out;
};

/** 64-bit size: the 32-bit field holds 1 and the real size follows the type. */
const largeBox = (type: string, ...payload: Uint8Array[]) => {
  const body = concat(payload);
  return concat([u32(1), ascii(type), u64(body.length + 16), body]);
};

const box = (type: string, ...payload: Uint8Array[]) => {
  const body = concat(payload);
  return concat([u32(body.length + 8), ascii(type), body]);
};

const zeros = (n: number) => new Uint8Array(n);
const fullBoxHeader = zeros(4); // version + flags

const esds = (config: number[]) =>
  box(
    'esds',
    fullBoxHeader,
    Uint8Array.from([0x03, 3 + 15 + 2 + config.length]),
    concat([u16(1), Uint8Array.from([0x00])]), // ES_ID + flags
    Uint8Array.from([0x04, 13]),
    Uint8Array.from([0x40]), // objectTypeIndication: AAC
    zeros(12),
    Uint8Array.from([0x05, config.length]),
    Uint8Array.from(config)
  );

const sampleEntry = ({ format, channels, sampleRate, config }: {
  format: string;
  channels: number;
  sampleRate: number;
  config?: number[];
}) =>
  box(
    format,
    zeros(6),
    u16(1), // data_reference_index
    zeros(8),
    u16(channels),
    u16(16), // samplesize
    zeros(4),
    u32(sampleRate << 16),
    ...(config ? [esds(config)] : [])
  );

interface TrackSpec {
  handler: string;
  format?: string;
  channels?: number;
  sampleRate?: number;
  timescale?: number;
  config?: number[];
  sizes?: number[];
  chunkOffsets?: number[];
  sampleToChunk?: { firstChunk: number; samplesPerChunk: number }[];
  mediaTime?: number | number[] | null;
  fixedSampleSize?: number;
  sampleCount?: number;
  use64BitOffsets?: boolean;
}

const trak = (spec: TrackSpec) => {
  const {
    handler,
    format = 'mp4a',
    channels = 2,
    sampleRate = 44100,
    timescale = 44100,
    config = [0x12, 0x10],
    sizes = [100, 120],
    chunkOffsets = [1000],
    sampleToChunk = [{ firstChunk: 1, samplesPerChunk: 2 }],
    mediaTime = null,
    fixedSampleSize = 0,
    sampleCount = sizes.length,
    use64BitOffsets = false
  } = spec;

  const stsz = fixedSampleSize
    ? box('stsz', fullBoxHeader, u32(fixedSampleSize), u32(sampleCount))
    : box('stsz', fullBoxHeader, u32(0), u32(sampleCount), ...sizes.map(u32));

  const chunkTable = use64BitOffsets
    ? box('co64', fullBoxHeader, u32(chunkOffsets.length), ...chunkOffsets.map(u64))
    : box('stco', fullBoxHeader, u32(chunkOffsets.length), ...chunkOffsets.map(u32));

  const stbl = box(
    'stbl',
    box('stsd', fullBoxHeader, u32(1), sampleEntry({ format, channels, sampleRate, config })),
    stsz,
    box(
      'stsc',
      fullBoxHeader,
      u32(sampleToChunk.length),
      ...sampleToChunk.flatMap((r) => [u32(r.firstChunk), u32(r.samplesPerChunk), u32(1)])
    ),
    chunkTable
  );

  const parts = [
    box(
      'mdia',
      box('mdhd', fullBoxHeader, zeros(8), u32(timescale), u32(1000)),
      box('hdlr', fullBoxHeader, zeros(4), ascii(handler)),
      box('minf', stbl)
    )
  ];

  if (mediaTime !== null) {
    const entries = Array.isArray(mediaTime) ? mediaTime : [mediaTime];
    parts.unshift(
      box(
        'edts',
        box('elst', fullBoxHeader, u32(entries.length), ...entries.flatMap((time) => [u32(5000), i32(time), u32(1)]))
      )
    );
  }

  return box('trak', ...parts);
};

const mp4 = (...traks: Uint8Array[]) => concat([box('ftyp', ascii('isom')), box('moov', ...traks)]);

describe('parseMp4AudioTrack', () => {
  it('reads the audio track config, sample table and edit-list trim', () => {
    const track = parseMp4AudioTrack(mp4(trak({ handler: 'soun', mediaTime: 1024 })));

    expect(track).not.toBeNull();
    expect(track!.format).toBe('mp4a');
    expect(track!.sampleRate).toBe(44100);
    expect(track!.channels).toBe(2);
    expect(Array.from(track!.config!)).toEqual([0x12, 0x10]);
    expect(track!.trimStart).toBe(1024);
    expect(track!.samples).toEqual([
      { offset: 1000, size: 100 },
      { offset: 1100, size: 120 }
    ]);
  });

  it('ignores video tracks and returns null when there is no audio track', () => {
    expect(parseMp4AudioTrack(mp4(trak({ handler: 'vide' })))).toBeNull();
  });

  it('picks the audio track when other tracks come first', () => {
    const file = mp4(trak({ handler: 'vide', format: 'avc1' }), trak({ handler: 'soun', sampleRate: 48000 }));
    expect(parseMp4AudioTrack(file)!.sampleRate).toBe(48000);
  });

  it('spreads samples across chunks per the sample-to-chunk table', () => {
    const track = parseMp4AudioTrack(
      mp4(
        trak({
          handler: 'soun',
          sizes: [10, 20, 30, 40, 50],
          chunkOffsets: [500, 900],
          sampleToChunk: [
            { firstChunk: 1, samplesPerChunk: 2 },
            { firstChunk: 2, samplesPerChunk: 3 }
          ]
        })
      )
    );

    expect(track!.samples).toEqual([
      { offset: 500, size: 10 },
      { offset: 510, size: 20 },
      { offset: 900, size: 30 },
      { offset: 930, size: 40 },
      { offset: 970, size: 50 }
    ]);
  });

  it('treats a missing or empty edit list as no trim', () => {
    expect(parseMp4AudioTrack(mp4(trak({ handler: 'soun' })))!.trimStart).toBe(0);
    expect(parseMp4AudioTrack(mp4(trak({ handler: 'soun', mediaTime: -1 })))!.trimStart).toBe(0);
  });

  it('takes the trim from the first real edit when an empty one precedes it', () => {
    const track = parseMp4AudioTrack(mp4(trak({ handler: 'soun', mediaTime: [-1, 1024] })));
    expect(track!.trimStart).toBe(1024);
  });

  it('returns null when the size table claims more entries than it holds', () => {
    expect(parseMp4AudioTrack(mp4(trak({ handler: 'soun', sampleCount: 50 })))).toBeNull();
  });

  it('returns null when the samples would outweigh the file', () => {
    const file = mp4(trak({ handler: 'soun', fixedSampleSize: 64, sampleCount: 10_000 }));
    expect(parseMp4AudioTrack(file)).toBeNull();
  });

  it('returns null for a table too large to decode, without building it', () => {
    // 17k stereo access units decode to ~70MB of PCM.
    const padded = (sampleCount: number) =>
      concat([
        mp4(trak({ handler: 'soun', fixedSampleSize: 1, sampleCount })),
        box('free', zeros(20_000))
      ]);

    expect(parseMp4AudioTrack(padded(17_000))).toBeNull();
    expect(parseMp4AudioTrack(padded(100))).not.toBeNull();
  });

  it('returns null for a file whose boxes run past the end of the buffer', () => {
    const file = mp4(trak({ handler: 'soun' }));
    expect(parseMp4AudioTrack(file.subarray(0, file.length - 12))).toBeNull();
  });

  it('returns null instead of throwing when a 64-bit box size is itself truncated', () => {
    // A size of 1 promises 8 more length bytes; only 4 are here.
    expect(parseMp4AudioTrack(concat([u32(1), ascii('moov'), u32(0)]))).toBeNull();
  });

  it('returns null for a truncated file with no sample tables', () => {
    expect(parseMp4AudioTrack(concat([box('ftyp', ascii('isom'))]))).toBeNull();
  });

  it('reads 64-bit chunk offsets from co64', () => {
    const track = parseMp4AudioTrack(
      mp4(trak({ handler: 'soun', chunkOffsets: [8_589_934_592], use64BitOffsets: true }))
    );

    expect(track!.samples).toEqual([
      { offset: 8_589_934_592, size: 100 },
      { offset: 8_589_934_692, size: 120 }
    ]);
  });

  it('applies a fixed sample size to every sample', () => {
    const track = parseMp4AudioTrack(
      mp4(trak({ handler: 'soun', fixedSampleSize: 64, sampleCount: 3, chunkOffsets: [200], sampleToChunk: [{ firstChunk: 1, samplesPerChunk: 3 }] }))
    );

    expect(track!.samples).toEqual([
      { offset: 200, size: 64 },
      { offset: 264, size: 64 },
      { offset: 328, size: 64 }
    ]);
  });

  it('walks boxes that carry a 64-bit size', () => {
    const file = concat([box('ftyp', ascii('isom')), largeBox('moov', trak({ handler: 'soun' }))]);
    expect(parseMp4AudioTrack(file)!.format).toBe('mp4a');
  });

  it('converts the edit-list trim from the media timescale to samples', () => {
    // 500 ticks of a 1000-tick timescale is 0.5s, i.e. 22050 samples at 44.1kHz.
    const track = parseMp4AudioTrack(mp4(trak({ handler: 'soun', timescale: 1000, mediaTime: 500 })));
    expect(track!.trimStart).toBe(22050);
  });
});

describe('isDecodableAacTrack', () => {
  const track = (overrides: Partial<Mp4AudioTrack> = {}): Mp4AudioTrack => ({
    format: 'mp4a',
    sampleRate: 44100,
    channels: 2,
    config: Uint8Array.from([0x12, 0x10]),
    samples: [{ offset: 0, size: 100 }],
    trimStart: 0,
    ...overrides
  });

  it('accepts an AAC track with a config and samples', () => {
    expect(isDecodableAacTrack(track())).toBe(true);
  });

  it('rejects a missing track, another codec, or a track with no config', () => {
    expect(isDecodableAacTrack(null)).toBe(false);
    expect(isDecodableAacTrack(track({ format: 'ac-3' }))).toBe(false);
    expect(isDecodableAacTrack(track({ config: null }))).toBe(false);
    expect(isDecodableAacTrack(track({ samples: [] }))).toBe(false);
  });

  it('rejects a track whose decoded audio would not fit the memory budget', () => {
    const samples = new Array(26_000).fill({ offset: 0, size: 100 });
    expect(isDecodableAacTrack(track({ samples }))).toBe(false);
  });

  it('accepts a track that fits the budget', () => {
    const samples = new Array(6_000).fill({ offset: 0, size: 100 });
    expect(isDecodableAacTrack(track({ samples }))).toBe(true);
  });

  it('measures the budget per channel, so mono allows twice the length of stereo', () => {
    const samples = new Array(20_000).fill({ offset: 0, size: 100 });
    expect(isDecodableAacTrack(track({ samples, channels: 1 }))).toBe(true);
    expect(isDecodableAacTrack(track({ samples, channels: 2 }))).toBe(false);
  });
});
