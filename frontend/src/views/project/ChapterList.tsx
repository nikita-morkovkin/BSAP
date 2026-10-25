import { useUiStore } from "@/store/ui.store";
import type { ProjectState } from "@/types/project.types";
import { sortedChapters } from "@/utils/project.util";
import { Accordion } from "@base-ui/react/accordion";
import ChapterItem from "./ChapterItem";

type ChapterListProps = { state: ProjectState };

const ChapterList = ({ state }: ChapterListProps) => {
  const expanded = useUiStore((store) => store.expandedChapters);
  const setExpanded = useUiStore((store) => store.setExpandedChapters);
  const chapters = sortedChapters(state.chapters);

  const canRegenerate =
    ["COMPLETED", "FAILED", "IDLE"].includes(state.status) &&
    chapters.every((chapter) => chapter.ttsStatus === "COMPLETED");

  const timeline = chapters.map((chapter, index) => ({
    chapter,
    startMs: chapters
      .slice(0, index)
      .reduce((sum, item) => sum + item.durationMs, 0),
  }));

  return (
    <Accordion.Root
      multiple
      value={expanded}
      onValueChange={setExpanded}
      className="space-y-3"
    >
      {timeline.map(({ chapter, startMs }) => (
        <ChapterItem
          key={chapter.chapterNumber}
          projectId={state.projectId}
          chapter={chapter}
          startMs={startMs}
          profile={state.profile}
          revision={state.updatedAt}
          canRegenerate={canRegenerate}
        />
      ))}
    </Accordion.Root>
  );
};

export default ChapterList;
