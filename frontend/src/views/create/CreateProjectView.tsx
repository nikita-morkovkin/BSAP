import QueryFeedback from "@/components/common/QueryFeedback";
import { useProjectDefaults } from "@/hooks/queries/useProjectDefaults.hook";
import ProjectForm from "./ProjectForm";
import { useMusic } from '@/hooks/queries/useMusic.hook';

const CreateProjectView = () => {
  const query = useProjectDefaults();
  const music = useMusic();

  const handleRetry = () => {
    query.refetch();
    music.refetch();
  };

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Episode creator
        </h1>
        <p className="mt-3 text-muted-foreground">
          Start with a topic. Shape the voice. Let your local pipeline do the
          rest.
        </p>
      </header>

      {query.isPending && (
        <QueryFeedback message="Loading your default profile and prompts…" />
      )}

      {query.isError && (
        <QueryFeedback
          error
          message="Could not load the default profile."
          onRetry={handleRetry}
        />
      )}
      {music.isPending && <p role="status">Loading soundtrack choices…</p>}
      {music.isError && <QueryFeedback error message="Could not load soundtrack choices." onRetry={handleRetry} />}
      {query.data && music.data && <ProjectForm defaults={query.data} tracks={music.data.tracks} />}
    </section>
  );
};

export default CreateProjectView;
