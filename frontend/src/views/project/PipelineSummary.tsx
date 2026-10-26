import Badge from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { useCancelOutlineMutation } from "@/hooks/mutations/useCancelOutlineMutation.hook";
import { useResumeProjectMutation } from "@/hooks/mutations/useResumeProjectMutation.hook";
import type { ProjectState } from "@/types/project.types";

type PipelineSummaryProps = { state: ProjectState };

const PipelineSummary = ({ state }: PipelineSummaryProps) => {
  const mutation = useResumeProjectMutation({ id: state.projectId });
  const cancelMutation = useCancelOutlineMutation({ id: state.projectId });
  const chunks = Object.values(state.chapters).flatMap(
    (chapter) => chapter.chunks,
  );
  const completed = chunks.filter(
    (chunk) => chunk.status === "COMPLETED",
  ).length;
  const progress =
    chunks.length > 0 ? Math.round((completed / chunks.length) * 100) : 0;
  const variant = state.status === "FAILED" ? "destructive" : "secondary";
  const showResume =
    state.status === "FAILED" ||
    state.status === "IDLE" ||
    state.status === "CANCELLED";
  const showCancel = state.status === "GENERATING_OUTLINE";
  const resumeLabel = mutation.isPending ? "Resuming…" : "Resume pipeline";
  const handleResume = () => mutation.mutate();

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge variant={variant}>{state.status.replaceAll("_", " ")}</Badge>
          {showCancel && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              aria-label="Cancel outline generation"
            >
              {cancelMutation.isPending ? "Cancelling…" : "Emergency cancel"}
            </Button>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {completed} / {chunks.length} chunks completed · {progress}%
        </span>
      </div>
      <Progress value={progress} aria-label="Completed audio chunks" />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {cancelMutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {cancelMutation.error.message}
        </p>
      )}
      {showResume && (
        <Button onClick={handleResume} disabled={mutation.isPending}>
          {resumeLabel}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Active stages refresh every 1.5 seconds. Completed, failed, and
        cancelled episodes stop polling.
      </p>
    </div>
  );
};

export default PipelineSummary;
