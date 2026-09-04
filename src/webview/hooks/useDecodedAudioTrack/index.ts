import { useCallback, useEffect, useRef, useState } from 'react';
import { isDecodableAacTrack, parseMp4AudioTrack, type Mp4AudioTrack } from 'utils/media/mp4-audio';
import { bindEvents } from 'utils/common/dom';

export type DecodedAudioState = 'unavailable' | 'idle' | 'decoding' | 'enabled' | 'failed';

/** Seconds. */
const MAX_DRIFT = 0.12;

const ignorePlaybackRejection = (): void => undefined;

const audioDecodedBytes = (video: HTMLVideoElement): number =>
  (video as unknown as { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount || 0;

/** Plays the audio track of a video whose codec the host cannot decode. See `vendor/fdk-aac/README.md`. */
export const useDecodedAudioTrack = (
  video: HTMLVideoElement | null,
  mediaBytes: Uint8Array | null,
  audioRef: React.RefObject<HTMLAudioElement>
) => {
  const [state, setState] = useState<DecodedAudioState>('unavailable');
  const trackRef = useRef<Mp4AudioTrack | null>(null);
  const urlRef = useRef<string | null>(null);
  const enableIdRef = useRef(0);
  const mutedByUsRef = useRef(false);

  const release = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, [audioRef]);

  const unmute = useCallback((element: HTMLVideoElement | null) => {
    if (!element || !mutedByUsRef.current) return;

    element.muted = false;
    mutedByUsRef.current = false;
  }, []);

  const reset = useCallback(
    (element: HTMLVideoElement | null) => {
      enableIdRef.current++;
      trackRef.current = null;
      release();
      unmute(element);
      setState('unavailable');
    },
    [release, unmute]
  );

  useEffect(() => {
    reset(video);
    if (!video || !mediaBytes) return;

    let cancelled = false;

    // canPlayType() and AudioDecoder.isConfigSupported() claim AAC support even with no decoder present.
    // Only the decoded-byte counter tells the truth, and it reads 0 until the host has decoded something.
    const detect = () => {
      if (cancelled) return;
      if (audioDecodedBytes(video)) {
        reset(video);
        return;
      }
      if (trackRef.current) return;

      const track = parseMp4AudioTrack(mediaBytes);
      if (!isDecodableAacTrack(track)) return;

      trackRef.current = track;
      setState('idle');
    };

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) detect();
    const unbind = bindEvents(video, { loadeddata: detect, playing: detect });

    return () => {
      cancelled = true;
      unbind();
    };
  }, [video, mediaBytes, reset]);

  const disable = useCallback(() => {
    enableIdRef.current++;
    release();
    unmute(video);
    setState((current) => (current === 'unavailable' ? current : 'idle'));
  }, [release, unmute, video]);

  const enable = useCallback(async () => {
    const audio = audioRef.current;
    if (!video || !audio || !mediaBytes || !trackRef.current) return;

    const enableId = ++enableIdRef.current;
    const superseded = () => enableId !== enableIdRef.current;

    setState('decoding');
    try {
      const { decodeAacTrack } = await import('utils/media/aac-decoder');
      const wav = await decodeAacTrack(mediaBytes, trackRef.current);
      if (superseded()) return;
      if (!wav) {
        setState('failed');
        return;
      }

      const url = URL.createObjectURL(wav);
      urlRef.current = url;
      audio.src = url;
      audio.currentTime = video.currentTime;
      audio.playbackRate = video.playbackRate;
      audio.volume = video.volume;

      video.muted = true;
      mutedByUsRef.current = true;
      if (!video.paused) await audio.play().catch(ignorePlaybackRejection);
      if (superseded()) return;

      setState('enabled');
    } catch {
      if (superseded()) return;
      release();
      setState('failed');
    }
  }, [audioRef, mediaBytes, release, video]);

  useEffect(() => {
    const audio = audioRef.current;
    if (state !== 'enabled' || !video || !audio) return;

    const resync = () => {
      if (Math.abs(audio.currentTime - video.currentTime) > MAX_DRIFT) {
        audio.currentTime = video.currentTime;
      }
    };

    const onPlay = () => {
      audio.currentTime = video.currentTime;
      void audio.play().catch(ignorePlaybackRejection);
    };
    const onPause = () => audio.pause();
    const onSeeked = () => {
      audio.currentTime = video.currentTime;
    };
    const onRateChange = () => {
      audio.playbackRate = video.playbackRate;
    };
    const onVolumeChange = () => {
      audio.volume = video.volume;
    };

    return bindEvents(video, {
      play: onPlay,
      pause: onPause,
      ended: onPause,
      seeked: onSeeked,
      ratechange: onRateChange,
      volumechange: onVolumeChange,
      timeupdate: resync
    });
  }, [audioRef, state, video]);

  useEffect(() => {
    return () => {
      enableIdRef.current++;
      release();
    };
  }, [release]);

  return { state, enable, disable };
};
