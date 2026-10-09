#!/bin/bash
#
# Rebuilds fdk-aac-decoder.wasm. Run from this directory:
#
#   FDK_AAC_SRC=/path/to/fdk-aac WASI_SDK=/path/to/wasi-sdk ./build.sh
#
# See README.md for the source revision and toolchain version the committed binary was built with.
#
set -euo pipefail

: "${FDK_AAC_SRC:?set FDK_AAC_SRC to a checkout of https://github.com/mstorsjo/fdk-aac}"
: "${WASI_SDK:?set WASI_SDK to an extracted wasi-sdk release}"

OUT="$(cd "$(dirname "$0")" && pwd)"

DEC_LIBS="libAACdec libFDK libSYS libMpegTPDec libSBRdec libPCMutils libArithCoding libDRCdec libSACdec"

INCLUDES=""
for d in libAACdec libArithCoding libDRCdec libSACdec libSBRdec libMpegTPDec libSYS libFDK libPCMutils; do
  INCLUDES="$INCLUDES -I$FDK_AAC_SRC/$d/include -I$FDK_AAC_SRC/$d/src"
done

SOURCES=""
for d in $DEC_LIBS; do
  SOURCES="$SOURCES $(ls "$FDK_AAC_SRC/$d"/src/*.cpp)"
done

# Decoder-only build: the encoder libraries (libAACenc, libSBRenc, libMpegTPEnc, libSACenc) are
# deliberately excluded. -w silences fdk-aac's "set architecture characterization defines" warning,
# which is expected for a generic (non-SIMD) target.
"$WASI_SDK/bin/clang++" \
  --target=wasm32-wasi \
  --sysroot="$WASI_SDK/share/wasi-sysroot" \
  -mexec-model=reactor \
  -Oz -w -DNDEBUG -fno-exceptions -fno-rtti -fno-threadsafe-statics \
  -fvisibility=hidden -ffunction-sections -fdata-sections \
  $INCLUDES \
  -I"$OUT" \
  -x c++ $SOURCES \
  -x c "$OUT/fdkaac_wrap.c" \
  -Wl,--no-entry -Wl,--gc-sections -Wl,--strip-all -Wl,--allow-undefined \
  -o "$OUT/fdk-aac-decoder.wasm"

ls -la "$OUT/fdk-aac-decoder.wasm"
