/*
 * Minimal WebAssembly wrapper around the FDK AAC decoder.
 *
 * Exposes just enough of aacdecoder_lib.h to decode raw AAC access units (as stored in an
 * mp4 `mdat`) into interleaved 16-bit PCM. Built for wasm32-wasi with wasi-sdk; see build.sh.
 */
#include <stdlib.h>
#include <string.h>

#include "aacdecoder_lib.h"

/* 8 channels * 2048 samples covers AAC-LC (1024) and HE-AAC/SBR (2048) frame sizes. */
#define MAX_OUT_SAMPLES (8 * 2048)

typedef struct {
  HANDLE_AACDECODER dec;
  INT_PCM pcm[MAX_OUT_SAMPLES];
  int sample_rate;
  int channels;
  int frame_size;
} Decoder;

#define EXPORT(name) __attribute__((export_name(name)))

EXPORT("fdkaac_open")
Decoder *fdkaac_open(void) {
  Decoder *d = (Decoder *)calloc(1, sizeof(Decoder));
  if (!d) return 0;
  /* TT_MP4_RAW: packet-based access units, configured out of band via ConfigRaw. */
  d->dec = aacDecoder_Open(TT_MP4_RAW, 1);
  if (!d->dec) {
    free(d);
    return 0;
  }
  return d;
}

/* Feeds the AudioSpecificConfig from the mp4 `esds` box. Returns 0 on success. */
EXPORT("fdkaac_config")
int fdkaac_config(Decoder *d, unsigned char *asc, int len) {
  if (!d || !d->dec || len <= 0) return -1;
  UCHAR *conf[1] = {asc};
  UINT conf_len[1] = {(UINT)len};
  return (int)aacDecoder_ConfigRaw(d->dec, conf, conf_len);
}

/*
 * Decodes one access unit. Returns the number of samples per channel on success,
 * or a negative fdk-aac error code.
 */
EXPORT("fdkaac_decode")
int fdkaac_decode(Decoder *d, unsigned char *in, int len) {
  if (!d || !d->dec || len <= 0) return -1;

  UCHAR *buf[1] = {in};
  UINT buf_size[1] = {(UINT)len};
  UINT valid = (UINT)len;

  AAC_DECODER_ERROR err = aacDecoder_Fill(d->dec, buf, buf_size, &valid);
  if (err != AAC_DEC_OK) return -(int)err;

  err = aacDecoder_DecodeFrame(d->dec, d->pcm, MAX_OUT_SAMPLES, 0);
  if (err != AAC_DEC_OK) return -(int)err;

  CStreamInfo *info = aacDecoder_GetStreamInfo(d->dec);
  if (!info) return -1;

  d->sample_rate = info->sampleRate;
  d->channels = info->numChannels;
  d->frame_size = info->frameSize;
  return info->frameSize;
}

EXPORT("fdkaac_pcm")
INT_PCM *fdkaac_pcm(Decoder *d) { return d ? d->pcm : 0; }

EXPORT("fdkaac_sample_rate")
int fdkaac_sample_rate(Decoder *d) { return d ? d->sample_rate : 0; }

EXPORT("fdkaac_channels")
int fdkaac_channels(Decoder *d) { return d ? d->channels : 0; }

EXPORT("fdkaac_close")
void fdkaac_close(Decoder *d) {
  if (!d) return;
  if (d->dec) aacDecoder_Close(d->dec);
  free(d);
}

/* Buffer allocation for the JS side. */
EXPORT("fdkaac_malloc")
void *fdkaac_malloc(int size) { return malloc((size_t)size); }

EXPORT("fdkaac_free")
void fdkaac_free(void *p) { free(p); }
