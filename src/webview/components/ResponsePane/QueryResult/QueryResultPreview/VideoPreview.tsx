import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import styled from 'styled-components';
import { IconMaximize, IconMinimize, IconVolume, IconVolumeOff, IconLoader2 } from '@tabler/icons';
import { useDecodedAudioTrack } from 'hooks/useDecodedAudioTrack';
import { bindEvents } from 'utils/common/dom';

interface VideoPreviewProps {
  contentType: string;
  dataBuffer: string;
}

// VS Code's webview iframe lacks the `fullscreen` permission, so Chromium disables its own control.
const nativeFullscreenAvailable = typeof document !== 'undefined' && document.fullscreenEnabled;

const CONTROLS_IDLE_MS = 2500;

const CONTROLS_HEIGHT = 48 + 24;

const PlayerFrame = styled.div<{ $hideFullscreenControl: boolean; $hideMuteControl: boolean }>`
  container-type: inline-size;

  video {
    object-position: top;
  }

  ${(props) => props.$hideFullscreenControl && 'video::-webkit-media-controls-fullscreen-button { display: none; }'}
  ${(props) => props.$hideMuteControl && 'video::-webkit-media-controls-mute-button { display: none; }'}
`;

const PlayerBox = styled.div`
  position: relative;
  width: 100%;
  height: calc(100cqw / var(--video-aspect, 1.7778) + ${CONTROLS_HEIGHT}px);
  max-height: 100%;
`;

const VideoPreview: React.FC<VideoPreviewProps> = React.memo(({ contentType, dataBuffer }) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const playerBoxRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<ReactPlayer>(null);

  const mediaBytes = useMemo(() => {
    const decoded = Buffer.from(dataBuffer, 'base64');
    return new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength);
  }, [dataBuffer]);
  const audio = useDecodedAudioTrack(video, mediaBytes, audioRef);

  useEffect(() => {
    const videoType = contentType.split(';')[0];
    const blob = new Blob([mediaBytes], { type: videoType });
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [contentType, mediaBytes]);

  useEffect(() => {
    if (!expanded) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpanded(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  useEffect(() => {
    const box = playerBoxRef.current;
    if (!video || !box) return;

    const applyAspect = () => {
      if (video.videoWidth && video.videoHeight) {
        box.style.setProperty('--video-aspect', String(video.videoWidth / video.videoHeight));
      }
    };

    applyAspect();
    video.addEventListener('loadedmetadata', applyAspect);
    return () => video.removeEventListener('loadedmetadata', applyAspect);
  }, [video]);

  useEffect(() => {
    const box = playerBoxRef.current;
    if (!video || !box) return;

    let idleTimer: number;

    const show = () => {
      setControlsVisible(true);
      window.clearTimeout(idleTimer);
      if (!video.paused) {
        idleTimer = window.setTimeout(() => setControlsVisible(false), CONTROLS_IDLE_MS);
      }
    };

    const hideWhilePlaying = () => {
      window.clearTimeout(idleTimer);
      if (!video.paused) setControlsVisible(false);
    };

    const unbind = [
      bindEvents(box, { mousemove: show, mouseleave: hideWhilePlaying }),
      bindEvents(video, { play: show, pause: show })
    ];
    show();

    return () => {
      window.clearTimeout(idleTimer);
      unbind.forEach((dispose) => dispose());
    };
  }, [video]);

  if (!videoUrl) return <div>Loading video...</div>;

  const audioLabel = {
    unavailable: '',
    idle: 'Play audio (decoded in Bruno — VS Code cannot decode this audio codec)',
    decoding: 'Decoding audio…',
    enabled: 'Mute audio',
    failed: 'This audio track could not be decoded'
  }[audio.state];

  const controlsInset = nativeFullscreenAvailable ? 'right-24' : 'right-12';

  const hideMuteControl = audio.state !== 'unavailable';

  return (
    <PlayerFrame
      $hideFullscreenControl={!nativeFullscreenAvailable}
      $hideMuteControl={hideMuteControl}
      className={expanded ? 'fixed inset-0 z-50 bg-black flex items-center' : 'relative w-full h-full'}
      data-testid="video-preview"
    >
      <PlayerBox ref={playerBoxRef}>
        <ReactPlayer
          ref={playerRef}
          url={videoUrl}
          controls
          width="100%"
          height="100%"
          onReady={() => setVideo((playerRef.current?.getInternalPlayer() as HTMLVideoElement) || null)}
          onError={(e) => console.error('Error loading video:', e)}
        />
        <audio ref={audioRef} className="hidden" data-testid="video-decoded-audio" />
        <div
          className={`absolute bottom-6 ${controlsInset} flex items-center transition-opacity duration-300 ${
            controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {audio.state === 'unavailable' ? null : (
            <button
              type="button"
              onClick={() => (audio.state === 'enabled' ? audio.disable() : audio.enable())}
              disabled={audio.state === 'decoding' || audio.state === 'failed'}
              title={audioLabel}
              aria-label={audioLabel}
              className="flex h-12 w-12 items-center justify-center text-white/90 hover:text-white disabled:opacity-50"
              data-testid="video-audio-btn"
            >
              {audio.state === 'decoding' ? (
                <IconLoader2 size={20} strokeWidth={2} className="animate-spin" />
              ) : audio.state === 'enabled' ? (
                <IconVolume size={20} strokeWidth={2} />
              ) : (
                <IconVolumeOff size={20} strokeWidth={2} />
              )}
            </button>
          )}
          {nativeFullscreenAvailable ? null : (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              title={expanded ? 'Exit full screen (Esc)' : 'Full screen'}
              aria-label={expanded ? 'Exit full screen' : 'Full screen'}
              className="flex h-12 w-12 items-center justify-center text-white/90 hover:text-white"
              data-testid="video-expand-btn"
            >
              {expanded ? <IconMinimize size={20} strokeWidth={2} /> : <IconMaximize size={20} strokeWidth={2} />}
            </button>
          )}
        </div>
      </PlayerBox>
    </PlayerFrame>
  );
});

export default VideoPreview;
