export interface Mp4AudioSample {
  offset: number;
  size: number;
}

export interface Mp4AudioTrack {
  format: string;
  sampleRate: number;
  channels: number;
  /** AudioSpecificConfig, from the `esds` box. */
  config: Uint8Array | null;
  samples: Mp4AudioSample[];
  /** Encoder delay, from the edit-list `media_time`. */
  trimStart: number;
}

/** AAC-LC per access unit; SBR emits twice as many. */
export const NOMINAL_FRAME_SAMPLES = 1024;

export const MAX_DECODED_BYTES = 64 * 1024 * 1024;

export const withinDecodeBudget = (sampleCount: number, channels: number): boolean =>
  sampleCount * NOMINAL_FRAME_SAMPLES * Math.max(channels, 1) * 2 <= MAX_DECODED_BYTES;

export const isDecodableAacTrack = (track: Mp4AudioTrack | null): boolean => {
  if (!track || track.format !== 'mp4a' || !track.config || !track.samples.length) return false;
  if (!track.sampleRate) return false;
  return withinDecodeBudget(track.samples.length, track.channels);
};

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts']);

interface TrackBuilder {
  handler: string | null;
  format: string | null;
  sampleRate: number;
  channels: number;
  config: Uint8Array | null;
  timescale: number;
  trimStart: number;
  tables: Record<string, { start: number; end: number }>;
}

export const parseMp4AudioTrack = (bytes: Uint8Array): Mp4AudioTrack | null => {
  try {
    return readAudioTrack(bytes);
  } catch {
    return null;
  }
};

const readAudioTrack = (bytes: Uint8Array): Mp4AudioTrack | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o: number) => view.getUint32(o);
  const u16 = (o: number) => view.getUint16(o);
  const u64 = (o: number) => Number(view.getBigUint64(o));
  const type = (o: number) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);

  const walk = (start: number, end: number, visit: (t: string, s: number, e: number) => void) => {
    let offset = start;
    while (offset + 8 <= end) {
      let size = u32(offset);
      let header = 8;
      if (size === 1) {
        size = u64(offset + 8);
        header = 16;
      } else if (size === 0) {
        size = end - offset;
      }
      if (size < header || offset + size > end) return;
      visit(type(offset + 4), offset + header, offset + size);
      offset += size;
    }
  };

  const tracks: TrackBuilder[] = [];
  let track: TrackBuilder | null = null;

  const visit = (boxType: string, start: number, end: number) => {
    if (boxType === 'trak') {
      track = {
        handler: null,
        format: null,
        sampleRate: 0,
        channels: 0,
        config: null,
        timescale: 0,
        trimStart: 0,
        tables: {}
      };
      tracks.push(track);
    }

    if (CONTAINERS.has(boxType)) {
      walk(start, end, visit);
      return;
    }
    if (!track) return;

    switch (boxType) {
      case 'hdlr':
        track.handler = type(start + 8);
        break;
      case 'mdhd':
        track.timescale = bytes[start] === 1 ? u32(start + 20) : u32(start + 12);
        break;
      case 'elst': {
        // A negative media_time marks an empty edit, written ahead of the real trim.
        const version = bytes[start];
        const entrySize = version === 1 ? 20 : 12;
        const entries = u32(start + 4);
        for (let i = 0; i < entries; i++) {
          const entry = start + 8 + i * entrySize;
          if (entry + entrySize > end) break;

          const mediaTime = version === 1 ? Number(view.getBigInt64(entry + 8)) : view.getInt32(entry + 4);
          if (mediaTime >= 0) {
            track.trimStart = mediaTime;
            break;
          }
        }
        break;
      }
      case 'stsd': {
        const entry = start + 8;
        track.format = type(entry + 4);
        // AudioSampleEntry: 8 header, 6 reserved, 2 data_reference_index, 8 reserved, 2 channelcount,
        // 2 samplesize, 2 predefined, 2 reserved, 4 samplerate as 16.16 fixed point.
        track.channels = u16(entry + 24);
        track.sampleRate = u32(entry + 32) >>> 16;
        walk(entry + 36, end, (childType, childStart, childEnd) => {
          if (childType === 'esds') {
            track!.config = parseEsds(bytes, childStart, childEnd);
          }
        });
        break;
      }
      case 'stsz':
      case 'stsc':
      case 'stco':
      case 'co64':
        track.tables[boxType] = { start, end };
        break;
      default:
        break;
    }
  };

  walk(0, bytes.byteLength, visit);

  const audio = tracks.find((t) => t.handler === 'soun');
  if (!audio) return null;

  const { stsz, stsc, stco, co64 } = audio.tables;
  if (!stsz || !stsc || !(stco || co64)) return null;

  const entryCount = (table: { start: number; end: number }, countOffset: number, entryBytes: number): number => {
    const count = u32(table.start + countOffset);
    return table.start + countOffset + 4 + count * entryBytes <= table.end ? count : 0;
  };

  if (stsz.start + 12 > stsz.end) return null;

  const fixedSize = u32(stsz.start + 4);
  const sampleCount = fixedSize ? u32(stsz.start + 8) : entryCount(stsz, 8, 4);
  if (!sampleCount || sampleCount * Math.max(fixedSize, 1) > bytes.byteLength) return null;
  if (!withinDecodeBudget(sampleCount, audio.channels)) return null;

  const sizes = new Array<number>(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    sizes[i] = fixedSize || u32(stsz.start + 12 + i * 4);
  }

  const chunkOffsets: number[] = [];
  if (stco) {
    const count = entryCount(stco, 4, 4);
    for (let i = 0; i < count; i++) chunkOffsets.push(u32(stco.start + 8 + i * 4));
  } else {
    const count = entryCount(co64!, 4, 8);
    for (let i = 0; i < count; i++) chunkOffsets.push(u64(co64!.start + 8 + i * 8));
  }

  const runs: { firstChunk: number; samplesPerChunk: number }[] = [];
  const runCount = entryCount(stsc, 4, 12);
  for (let i = 0; i < runCount; i++) {
    const o = stsc.start + 8 + i * 12;
    runs.push({ firstChunk: u32(o), samplesPerChunk: u32(o + 4) });
  }
  if (!runs.length) return null;

  const samples: Mp4AudioSample[] = [];
  let index = 0;
  for (let chunk = 0; chunk < chunkOffsets.length && index < sampleCount; chunk++) {
    let perChunk = runs[0].samplesPerChunk;
    for (let r = runs.length - 1; r >= 0; r--) {
      if (chunk + 1 >= runs[r].firstChunk) {
        perChunk = runs[r].samplesPerChunk;
        break;
      }
    }
    let offset = chunkOffsets[chunk];
    for (let s = 0; s < perChunk && index < sampleCount; s++) {
      samples.push({ offset, size: sizes[index] });
      offset += sizes[index];
      index++;
    }
  }

  // media_time is in the media timescale, usually but not always the sample rate.
  const trimStart = audio.timescale
    ? Math.round((audio.trimStart * audio.sampleRate) / audio.timescale)
    : audio.trimStart;

  return {
    format: audio.format || '',
    sampleRate: audio.sampleRate,
    channels: audio.channels,
    config: audio.config,
    samples,
    trimStart
  };
};

/** esds -> ES_Descriptor -> DecoderConfigDescriptor -> DecoderSpecificInfo. */
const parseEsds = (bytes: Uint8Array, start: number, end: number): Uint8Array | null => {
  let offset = start + 4; // version + flags

  const readLength = () => {
    let length = 0;
    for (let i = 0; i < 4; i++) {
      const byte = bytes[offset++];
      length = (length << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) break;
    }
    return length;
  };

  while (offset < end) {
    const tag = bytes[offset++];
    const length = readLength();
    if (tag === 0x03) {
      offset += 2; // ES_ID
      const flags = bytes[offset++];
      if (flags & 0x80) offset += 2; // dependsOn_ES_ID
      if (flags & 0x40) offset += 1 + bytes[offset]; // URL
      if (flags & 0x20) offset += 2; // OCR_ES_Id
    } else if (tag === 0x04) {
      offset += 13; // objectTypeIndication + stream type + buffer/bitrate fields
    } else if (tag === 0x05) {
      return bytes.slice(offset, Math.min(offset + length, end));
    } else {
      offset += length;
    }
  }
  return null;
};
