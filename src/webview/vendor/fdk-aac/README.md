# fdk-aac decoder (WebAssembly)

`fdk-aac-decoder.wasm` is a decoder-only build of the Fraunhofer FDK AAC library, used to play the
audio of AAC responses in the response pane.

## Why this exists

VS Code ships Electron with the non-proprietary ffmpeg build, which contains no AAC (or MP3) decoder.
An mp4 response therefore plays video but has **no audio track at all** from the webview's point of
view: `webkitAudioDecodedByteCount` stays `0`, `AudioContext.decodeAudioData()` fails with
`EncodingError`, and Chromium disables the mute/unmute control because the element reports no audio.
Note that `canPlayType()`, `MediaSource.isTypeSupported()` and `AudioDecoder.isConfigSupported()` all
report AAC as supported in that environment — they answer from a compile-time table, not from the
decoders actually present, so they cannot be used to detect this.

Bruno desktop is unaffected: it runs as a top-level Electron document with a full-codec ffmpeg.

## Licensing and patents

The FDK AAC license (`NOTICE`) permits redistribution in source and binary form with attribution.
It is **not** GPL, unlike FAAD2-based decoders (`@audio/decode-aac` and everything that wraps it),
which is why it was chosen for this MIT-licensed extension.

Section 3 of that license disclaims any patent grant: *"the use of this software may be subject to
third party patent rights"*. AAC is patent-encumbered, which is precisely why VS Code omits the
decoder. Keep `NOTICE` alongside the binary in any redistribution.

## Provenance

| | |
|---|---|
| Source | https://github.com/mstorsjo/fdk-aac |
| Revision | `d8e6b1a3aa606c450241632b64b703f21ea31ce3` |
| Toolchain | wasi-sdk 33.0 (clang 22.1.0-wasi-sdk), target `wasm32-wasi` |
| Size | 630 KB |
| SHA-256 | `743ef1e78c93d4731034421d03129871c85e583b6a670a25917def816d7dc68a` |

Encoder libraries are excluded from the build; only the decoder is compiled.

## Rebuilding

```bash
FDK_AAC_SRC=/path/to/fdk-aac WASI_SDK=/path/to/wasi-sdk ./build.sh
```

`fdkaac_wrap.c` is the wrapper compiled into the module. It exposes a small C ABI
(`fdkaac_open`, `fdkaac_config`, `fdkaac_decode`, `fdkaac_pcm`, `fdkaac_sample_rate`,
`fdkaac_channels`, `fdkaac_close`, `fdkaac_malloc`, `fdkaac_free`) over `aacdecoder_lib.h`.
The module is a WASI reactor: call `_initialize()` once after instantiating. Its six
`wasi_snapshot_preview1` imports are stdio/exit stubs that are never exercised — see
`utils/media/aac-decoder.ts`.

## Verifying a rebuild

The committed binary was checked against Chromium's own AAC decoder by decoding a 5s AAC-LC clip
both ways and comparing PCM: identical sample count and **0.29% residual RMS** (max absolute sample
difference 0.0025), consistent with fixed-point vs float rounding. If you rebuild, re-run that
comparison rather than only checking that audio is audible — a wrong channel or sample-rate
configuration still produces plausible-sounding output.
