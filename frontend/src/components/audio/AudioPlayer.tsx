import { Button } from "@/components/ui/Button";
import { useAudioPlayerStore } from "@/store/audioPlayer.store";
import { useEffect, useRef, type ChangeEvent } from "react";
import { toast } from "sonner";

const AudioPlayer = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioUrl = useAudioPlayerStore((state) => state.audioUrl);
  const isPlaying = useAudioPlayerStore((state) => state.isPlaying);
  const activeChunkId = useAudioPlayerStore((state) => state.activeChunkId);
  const volume = useAudioPlayerStore((state) => state.volume);
  const pause = useAudioPlayerStore((state) => state.pause);
  const reset = useAudioPlayerStore((state) => state.reset);
  const setVolume = useAudioPlayerStore((state) => state.setVolume);
  const source = audioUrl ?? undefined;
  const pauseDisabled = !isPlaying;

  const handleError = () => {
    pause();
    toast.error("Audio preview unavailable. Try playing the chunk again.");
  };

  const handleVolume = (event: ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(event.target.value));
  };

  useEffect(() => {
    const audio = audioRef.current;
    let cancelled = false;

    if (!audio) {
      return;
    }

    if (isPlaying && audioUrl) {
      audio.play().catch(() => {
        if (
          !cancelled &&
          useAudioPlayerStore.getState().audioUrl === audioUrl
        ) {
          pause();
          toast.error("Playback could not start. Try playing the chunk again.");
        }
      });
    } else {
      audio.pause();
    }

    return () => {
      cancelled = true;
    };
  }, [audioUrl, isPlaying, pause]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  return (
    <aside
      className="sticky bottom-0 z-30 border-t bg-background/95 px-5 py-3 backdrop-blur"
      aria-label="Audio preview player"
    >
      <audio
        ref={audioRef}
        src={source}
        onEnded={pause}
        onError={handleError}
        preload="none"
      />
      {activeChunkId ? (
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 text-sm">
          <span className="min-w-0 flex-1 truncate">
            Preview · {activeChunkId}
          </span>
          <label className="flex items-center gap-2">
            Volume
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={handleVolume}
              className="w-24"
            />
          </label>
          <Button variant="outline" onClick={pause} disabled={pauseDisabled}>
            Pause
          </Button>
          <Button variant="ghost" onClick={reset}>
            Close preview
          </Button>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Select a completed chunk to preview its narration.
        </p>
      )}
    </aside>
  );
};

export default AudioPlayer;
