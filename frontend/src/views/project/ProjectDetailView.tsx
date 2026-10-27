import QueryFeedback from '@/components/common/QueryFeedback';
import { useProject } from '@/hooks/queries/useProject.hook';
import ChapterList from './ChapterList';
import PipelineSummary from './PipelineSummary';
import ProjectMusicPanel from './ProjectMusicPanel';
import VideoStepPage from '@/views/video/VideoStepPage';
import ExportsPanel from '@/views/exports/ExportsPanel';

type ProjectDetailViewProps = { projectId: string };

const ProjectDetailView = ({ projectId }: ProjectDetailViewProps) => {
  const query = useProject({ id: projectId });
  const handleRetry = () => { query.refetch(); };

  if (!query.data) {
    return <QueryFeedback error={query.isError} message="Loading episode state…" onRetry={handleRetry} />;
  }

  const { state, outline } = query.data;

  return (
    <section className="space-y-6">
      <header>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Live pipeline monitor</p>
        <h1 className="text-3xl font-semibold tracking-tight">{state.topic}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{state.projectId}</p>
      </header>
      {query.isError && <QueryFeedback error message="Connection interrupted. Showing the last saved state." onRetry={handleRetry} />}
      <PipelineSummary state={state} />
      <ProjectMusicPanel key={state.projectId} state={state} productionBusy={query.data.productionBusy} />
      <VideoStepPage key={projectId} projectId={projectId} />
      <ExportsPanel projectId={projectId} />
      <h2 className="text-xl font-semibold">Chapters & narration</h2>
      {Object.keys(state.chapters).length === 0 && (
        <div className="rounded-2xl border p-6 text-sm text-muted-foreground">
          {outline ? `Outline ready: ${outline.totalChapters} chapters. Waiting for narration…` : 'Your outline will appear as the pipeline begins.'}
        </div>
      )}
      <ChapterList state={state} />
    </section>
  );
};

export default ProjectDetailView;