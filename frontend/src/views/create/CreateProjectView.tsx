import QueryFeedback from "@/components/common/QueryFeedback";
import { useProjectDefaults } from "@/hooks/queries/useProjectDefaults.hook";
import ProjectForm from "./ProjectForm";

const CreateProjectView = () => {
  const query = useProjectDefaults();

  const handleRetry = () => {
    query.refetch();
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
      {query.data && <ProjectForm defaults={query.data} />}
    </section>
  );
};

export default CreateProjectView;
