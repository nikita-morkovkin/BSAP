import { Button } from "@/components/ui/Button";
import { useProjects } from "@/hooks/queries/useProjects.hook";
import { useUiStore } from "@/store/ui.store";
import { Plus } from "lucide-react";
import ProjectListItem from "./ProjectListItem";

const Sidebar = () => {
  const query = useProjects();
  const handleCreate = () => useUiStore.getState().setActiveTab("create");
  const handleRetry = () => {
    query.refetch();
  };
  const projects = query.data ?? [];

  return (
    <aside className="border-b bg-card p-5 lg:sticky lg:top-0 lg:h-dvh lg:w-72 lg:shrink-0 lg:overflow-auto lg:border-r lg:border-b-0">
      <Button onClick={handleCreate} className="w-full">
        <Plus />
        New episode
      </Button>
      <h2 className="mt-7 mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Your episodes
      </h2>
      {query.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading episodes…
        </p>
      )}
      {query.isError && (
        <Button variant="outline" onClick={handleRetry}>
          Retry episode list
        </Button>
      )}
      {!query.isPending && !query.isError && projects.length === 0 && (
        <p className="text-sm leading-6 text-muted-foreground">
          Your studio is quiet. Create your first episode to begin.
        </p>
      )}
      <ul className="max-h-72 space-y-1 mt-4 overflow-auto lg:max-h-none">
        {projects.map((project) => (
          <ProjectListItem key={project.projectId} project={project} />
        ))}
      </ul>
    </aside>
  );
};

export default Sidebar;
