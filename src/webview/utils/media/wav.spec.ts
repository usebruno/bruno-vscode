import { wavBlobFromPcmChunks } from './wav';

const header = async (blob: Blob) => new DataView(await blob.arrayBuffer());

const ascii = (view: DataView, offset: number, length: number) =>
  Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');

const wav = (chunks: Int16Array[], sampleRate: number, channels: number) =>
  wavBlobFromPcmChunks({
    chunks,
    totalSamples: chunks.reduce((n, chunk) => n + chunk.length, 0),
    sampleRate,
    channels
  });

describe('wavBlobFromPcmChunks', () => {
  const pcm = Int16Array.from([0, 1000, -1000, 32767]);

  it('writes a 16-bit PCM header matching the audio format', async () => {
    const view = await header(wav([pcm], 44100, 2));

    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(2); // channels
    expect(view.getUint32(24, true)).toBe(44100);
    expect(view.getUint32(28, true)).toBe(44100 * 2 * 2); // byte rate
    expect(view.getUint16(32, true)).toBe(4); // block align
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
  });

  it('sizes the RIFF and data chunks from the sample count', async () => {
    const blob = wav([pcm], 8000, 1);
    const view = await header(blob);

    expect(blob.size).toBe(44 + pcm.length * 2);
    expect(view.getUint32(4, true)).toBe(36 + pcm.length * 2);
    expect(ascii(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(pcm.length * 2);
  });

  it('writes the samples little-endian after the header', async () => {
    const view = await header(wav([pcm], 8000, 1));

    for (let i = 0; i < pcm.length; i++) {
      expect(view.getInt16(44 + i * 2, true)).toBe(pcm[i]);
    }
  });

  it('joins the chunks in order and releases each one', async () => {
    const chunks = [Int16Array.from([1, 2]), Int16Array.from([3]), Int16Array.from([4, 5])];
    const view = await header(wav(chunks, 8000, 1));

    expect([0, 1, 2, 3, 4].map((i) => view.getInt16(44 + i * 2, true))).toEqual([1, 2, 3, 4, 5]);
    expect(chunks.every((chunk) => chunk.length === 0)).toBe(true);
  });

  it('drops the trimmed samples from the front, across chunk boundaries', async () => {
    const blob = wavBlobFromPcmChunks({
      chunks: [Int16Array.from([1, 2]), Int16Array.from([3, 4, 5])],
      totalSamples: 5,
      trimSamples: 3,
      sampleRate: 8000,
      channels: 1
    });
    const view = await header(blob);

    expect(blob.size).toBe(44 + 2 * 2);
    expect(view.getInt16(44, true)).toBe(4);
    expect(view.getInt16(46, true)).toBe(5);
  });

  it('drops everything when the trim covers the whole track', async () => {
    const blob = wavBlobFromPcmChunks({
      chunks: [Int16Array.from([1, 2])],
      totalSamples: 2,
      trimSamples: 9,
      sampleRate: 8000,
      channels: 1
    });

    expect(blob.size).toBe(44);
  });

  it('stops at the stated sample count when a chunk would overrun it', async () => {
    const blob = wavBlobFromPcmChunks({
      chunks: [Int16Array.from([1, 2]), Int16Array.from([3, 4])],
      totalSamples: 2,
      sampleRate: 8000,
      channels: 1
    });
    const view = await header(blob);

    expect(blob.size).toBe(44 + 4);
    expect(view.getInt16(44, true)).toBe(1);
    expect(view.getInt16(46, true)).toBe(2);
  });

  it('handles mono 8kHz with no samples', async () => {
    const blob = wav([], 8000, 1);
    const view = await header(blob);

    expect(blob.size).toBe(44);
    expect(view.getUint32(40, true)).toBe(0);
  });
});
