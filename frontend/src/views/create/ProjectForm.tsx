import CatalogSelect from "@/components/common/CatalogSelect";
import MusicSelector from "@/components/music/MusicSelector";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Slider } from "@/components/ui/Slider";
import { useModels, useVoices } from "@/hooks/queries/useSettings.hook";
import { useProjectForm } from "@/hooks/useProjectForm.hook";
import type { MusicTrack } from "@/types/music.types";
import type { Profile } from "@/types/project.types";
import { getModelEffort } from "@/utils/settings.util";
import { Sparkles } from "lucide-react";
import type { SubmitEvent } from "react";
import ProfileTextField from "./ProfileTextField";
import PromptStudio from "./PromptStudio";
import ReasoningSelect from "./ReasoningSelect";

type ProjectFormProps = { defaults: Profile; tracks: MusicTrack[] };

const ProjectForm = ({ defaults, tracks }: ProjectFormProps) => {
  const form = useProjectForm({ defaults, tracks });
  const { profile } = form;
  const models = useModels();
  const voices = useVoices();

  const architect = models.data?.find(
    (model) => model.id === profile.architectModel,
  );

  const writer = models.data?.find((model) => model.id === profile.writerModel);

  const architectEffort = getModelEffort(
    architect,
    profile.architectReasoningEffort,
  );

  const writerEffort = getModelEffort(writer, profile.writerReasoningEffort);
  const validVoice = voices.data?.some(
    (voice) => voice.id === profile.ttsVoice,
  );

  const ready =
    !!architect && !!writer && validVoice && !models.isError && !voices.isError;
  const speedLabel = `Narration speed · ${profile.ttsSpeed.toFixed(2)}×`;
  const speedValue = [profile.ttsSpeed];
  const submitLabel = form.isPending ? "Queuing episode…" : "Create episode";

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    if (!ready) {
      event.preventDefault();
      return;
    }

    form.handleSubmit(event, {
      architectReasoningEffort: architectEffort,
      writerReasoningEffort: writerEffort,
    });
  };

  return (
    <form onSubmit={(event) => handleSubmit(event)} className="space-y-6">
      <fieldset
        disabled={form.isPending}
        className="space-y-6 rounded-2xl border bg-card p-5 sm:p-8"
      >
        <legend className="sr-only">Episode settings</legend>
        <label className="grid gap-2 font-medium">
          Title
          <Input
            name="title"
            value={form.title}
            onChange={form.handleTitle}
            placeholder="The Hidden Life of the Ocean"
            aria-describedby="episode-title-limit"
          />
          <span
            id="episode-title-limit"
            className="text-xs text-muted-foreground"
          >
            {form.title.length}/100 characters
          </span>
          {form.title.trim().length === 0 && (
            <span className="text-xs text-destructive">
              Enter an episode title.
            </span>
          )}
          {form.title.trim().length > 100 && (
            <span className="text-xs text-destructive">
              Title must be 100 characters or fewer.
            </span>
          )}
        </label>
        <label className="grid gap-2 font-medium">
          Description
          <textarea
            name="description"
            value={form.description}
            onChange={form.handleDescription}
            placeholder="A gentle journey through the hidden life of the ocean…"
            aria-describedby="episode-description-limit"
            rows={5}
            className="w-full min-w-0 resize-y rounded-xl border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
          />
          <span
            id="episode-description-limit"
            className="text-xs text-muted-foreground"
          >
            {form.description.length}/2,000 characters
          </span>
          {form.description.trim().length === 0 && (
            <span className="text-xs text-destructive">
              Enter an episode description.
            </span>
          )}
          {form.description.trim().length > 2000 && (
            <span className="text-xs text-destructive">
              Description must be 2,000 characters or fewer.
            </span>
          )}
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          {(["architect", "writer"] as const).map((role) => (
            <CatalogSelect
              key={role}
              label={role === "architect" ? "Architect model" : "Writer model"}
              value={profile[`${role}Model`]}
              options={models.data ?? []}
              loading={models.isPending}
              error={models.isError}
              onRetry={() => models.refetch()}
              onChange={(value) => {
                const model = models.data?.find((item) => item.id === value);

                if (role === "architect") {
                  form.updateProfile({
                    architectModel: value,
                    architectReasoningEffort: getModelEffort(
                      model,
                      profile.architectReasoningEffort,
                    ),
                  });
                } else {
                  form.updateProfile({
                    writerModel: value,
                    writerReasoningEffort: getModelEffort(
                      model,
                      profile.writerReasoningEffort,
                    ),
                  });
                }
              }}
            />
          ))}
          <ReasoningSelect
            label="Architect reasoning effort"
            value={architectEffort}
            options={architect?.reasoning.supportedEfforts ?? []}
            onChange={form.handleArchitectEffort}
          />
          <ReasoningSelect
            label="Writer reasoning effort"
            value={writerEffort}
            options={writer?.reasoning.supportedEfforts ?? []}
            onChange={form.handleWriterEffort}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Models and reasoning options come from Polza. Voice IDs come from the
          local Kokoro service; speed is configured separately.
        </p>
        <label className="grid gap-2 text-sm font-medium">
          Temperature
          <Input
            type="number"
            name="temperature"
            min={0}
            max={2}
            step={0.05}
            value={profile.temperature}
            onChange={form.handleProfile}
            required
          />
        </label>
        <CatalogSelect
          label="Narrator voice"
          value={profile.ttsVoice}
          options={voices.data ?? []}
          loading={voices.isPending}
          error={voices.isError}
          onRetry={() => voices.refetch()}
          onChange={(ttsVoice) => form.updateProfile({ ttsVoice })}
        />
        <div className="grid items-center gap-6 sm:grid-cols-2">
          <div className="space-y-4">
            <p className="text-sm font-medium">{speedLabel}</p>
            <Slider
              aria-label="Narration speed"
              value={speedValue}
              min={0.7}
              max={1.1}
              step={0.01}
              onValueChange={form.handleSpeed}
            />
            <p className="text-xs text-muted-foreground">
              0.70× · slower and softer → 1.10× · natural pace
            </p>
          </div>
          <ProfileTextField
            label="Maximum chunk characters"
            name="maxChunkChars"
            value={profile.maxChunkChars}
            onChange={form.handleProfile}
            type="number"
          />
        </div>
        <PromptStudio profile={profile} onChange={form.handleProfile} />
        <MusicSelector
          tracks={tracks}
          selected={form.selectedTrackIds}
          onChange={form.setSelectedTrackIds}
        />
        <Button
          type="submit"
          size="lg"
          disabled={form.isPending || !ready || !form.canSubmit}
        >
          <Sparkles />
          {submitLabel}
        </Button>
      </fieldset>
    </form>
  );
};

export default ProjectForm;
