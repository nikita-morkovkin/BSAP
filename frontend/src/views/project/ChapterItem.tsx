import Badge from "@/components/ui/Badge";
import type { Chapter, Profile } from "@/types/project.types";
import { formatTimestamp } from "@/utils/project.util";
import { Accordion } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";
import ChunkRow from "./ChunkRow";

type ChapterItemProps = {
  projectId: string;
  chapter: Chapter;
  profile: Profile;
  startMs: number;
  revision: string;
  canRegenerate: boolean;
};

const ChapterItem = ({
  projectId,
  chapter,
  profile,
  startMs,
  revision,
  canRegenerate,
}: ChapterItemProps) => {
  const value = String(chapter.chapterNumber);
  const duration = formatTimestamp(chapter.durationMs);
  const start = formatTimestamp(startMs);
  const chunks = [...chapter.chunks].sort(
    (left, right) => left.index - right.index,
  );

  return (
    <Accordion.Item
      value={value}
      className="overflow-hidden rounded-2xl border bg-card"
    >
      <Accordion.Header>
        <Accordion.Trigger className="flex w-full items-center gap-4 p-5 text-left">
          <span className="text-sm tabular-nums text-muted-foreground">
            {chapter.chapterNumber}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{chapter.title}</span>
            <span className="text-xs text-muted-foreground">
              Starts {start} · duration {duration} · {chunks.length} chunks
            </span>
          </span>
          <Badge variant="secondary">{chapter.ttsStatus}</Badge>
          <ChevronDown className="size-4 shrink-0" />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel className="border-t p-4">
        {chunks.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Syntactic chunks will appear after normalization.
          </p>
        )}
        <ul className="space-y-3">
          {chunks.map((chunk) => (
            <ChunkRow
              key={chunk.id}
              chunk={chunk}
              projectId={projectId}
              chapterNumber={chapter.chapterNumber}
              profile={profile}
              revision={revision}
              canRegenerate={canRegenerate}
            />
          ))}
        </ul>
      </Accordion.Panel>
    </Accordion.Item>
  );
};

export default ChapterItem;
