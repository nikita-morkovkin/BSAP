import Badge from "@/components/ui/Badge";
import type { Chunk, Profile } from "@/types/project.types";
import ChunkPlaybackButton from "./ChunkPlaybackButton";
import RegenerateChunkDialog from "./RegenerateChunkDialog";

type ChunkRowProps = {
  projectId: string;
  chapterNumber: number;
  chunk: Chunk;
  profile: Profile;
  revision: string;
  canRegenerate: boolean;
};

const ChunkRow = ({
  projectId,
  chapterNumber,
  chunk,
  profile,
  revision,
  canRegenerate,
}: ChunkRowProps) => {
  const playbackDisabled = chunk.status !== "COMPLETED";
  const regenerateDisabled = !canRegenerate;
  const variant = chunk.status === "FAILED" ? "destructive" : "secondary";

  return (
    <li className="space-y-3 rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Chunk {chunk.index + 1}</span>
        <Badge variant={variant}>{chunk.status}</Badge>
        <Badge variant="outline">Pause {chunk.pauseAfterMs} ms</Badge>
      </div>
      <p className="text-sm leading-7">{chunk.text}</p>
      <div className="flex flex-wrap items-center gap-2">
        <ChunkPlaybackButton
          projectId={projectId}
          chunkId={chunk.id}
          revision={revision}
          disabled={playbackDisabled}
        />
        <RegenerateChunkDialog
          projectId={projectId}
          chapterNumber={chapterNumber}
          chunk={chunk}
          profile={profile}
          disabled={regenerateDisabled}
        />
      </div>
    </li>
  );
};

export default ChunkRow;
