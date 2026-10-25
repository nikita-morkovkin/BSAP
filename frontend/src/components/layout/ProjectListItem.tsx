import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useDeleteProjectMutation } from "@/hooks/mutations/useDeleteProjectMutation.hook";
import { useUiStore } from "@/store/ui.store";
import type { ProjectSummary } from "@/types/project.types";
import { Trash2 } from "lucide-react";

type ProjectListItemProps = { project: ProjectSummary };

const ProjectListItem = ({ project }: ProjectListItemProps) => {
  const deletion = useDeleteProjectMutation();

  const handleSelect = () =>
    useUiStore.getState().selectProject(project.projectId);

  const isSelected = useUiStore(
    (state) => state.selectedProjectId === project.projectId,
  );

  const current = isSelected ? "page" : undefined;
  const className = isSelected
    ? "w-full space-y-2 rounded-xl border bg-accent p-3 text-left"
    : "w-full space-y-2 rounded-xl border border-transparent p-3 text-left hover:bg-muted";

  const handleClick = () => {
    if (
      window.confirm(
        `Permanently delete “${project.topic}” and all its files? This cannot be undone.`,
      )
    ) {
      deletion.mutate(project.projectId);
    }
  };

  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        className={className}
        aria-current={current}
        onClick={handleSelect}
      >
        <span className="block text-sm font-medium wrap-anywhere">
          {project.topic}
        </span>
        <Badge variant="outline">{project.status.replaceAll("_", " ")}</Badge>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={deletion.isPending}
        aria-label={`Delete ${project.topic}`}
        title="Delete episode"
        onClick={() => handleClick}
      >
        <Trash2 />
      </Button>
    </li>
  );
};

export default ProjectListItem;
