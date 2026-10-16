export interface PcmChunks {
  /** Emptied as it is written. */
  chunks: Int16Array[];
  totalSamples: number;
  /** Encoder delay, from the mp4 edit list. */
  trimSamples?: number;
  sampleRate: number;
  channels: number;
}

const EMPTY = new Int16Array(0);

/** Chunks are dropped as they are copied; holding both copies exhausts webview memory on a long track. */
export const wavBlobFromPcmChunks = ({
  chunks,
  totalSamples,
  trimSamples = 0,
  sampleRate,
  channels
}: PcmChunks): Blob => {
  const trim = Math.min(Math.max(trimSamples, 0), totalSamples);
  const samples = totalSamples - trim;
  const dataBytes = samples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  const pcm = new Int16Array(buffer, 44);
  let dropped = 0;
  let written = 0;
  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    chunks[i] = EMPTY;

    if (dropped < trim) {
      const drop = Math.min(trim - dropped, chunk.length);
      dropped += drop;
      chunk = chunk.subarray(drop);
    }
    if (written + chunk.length > samples) break;

    pcm.set(chunk, written);
    written += chunk.length;
  }

  return new Blob([buffer], { type: 'audio/wav' });
};
