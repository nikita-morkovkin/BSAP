import { apiClient } from "@/api/apiClient";
import { Button } from "@/components/ui/Button";
import { useAudioPlayerStore } from "@/store/audioPlayer.store";
import { Pause, Play } from "lucide-react";

type ChunkPlaybackButtonProps = {
  projectId: string;
  chunkId: string;
  revision: string;
  disabled: boolean;
};

const ChunkPlaybackButton = ({
  projectId,
  chunkId,
  revision,
  disabled,
}: ChunkPlaybackButtonProps) => {
  const identity = `${projectId}:${chunkId}`;

  const isPlaying = useAudioPlayerStore(
    (state) => state.activeChunkId === identity && state.isPlaying,
  );

  const label = isPlaying ? "Pause chunk" : "Play chunk";

  const handleToggle = () => {
    const player = useAudioPlayerStore.getState();

    if (isPlaying) {
      player.pause();
    } else {
      player.playChunk(
        identity,
        apiClient.media.chunkAudioUrl(projectId, chunkId, revision),
      );
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      onClick={handleToggle}
      disabled={disabled}
    >
      {isPlaying ? <Pause /> : <Play />}
    </Button>
  );
};

export default ChunkPlaybackButton;
