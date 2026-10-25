import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Slider } from '@/components/ui/Slider';
import { useProjectForm } from '@/hooks/useProjectForm.hook';
import type { Profile } from '@/types/project.types';
import ProfileTextField from './ProfileTextField';
import PromptStudio from './PromptStudio';
import ReasoningSelect from './ReasoningSelect';
import CatalogSelect from '@/components/common/CatalogSelect';
import { useModels, useVoices } from '@/hooks/queries/useSettings.hook';
import { getModelEffort } from '@/utils/settings.util';

type ProjectFormProps = { defaults: Profile };

const ProjectForm = ({ defaults }: ProjectFormProps) => {
  const form = useProjectForm({ defaults });
  const { profile } = form;
  const models = useModels();
  const voices = useVoices();
  const architect = models.data?.find((model) => model.id === profile.architectModel);
  const writer = models.data?.find((model) => model.id === profile.writerModel);
  const architectEffort = getModelEffort(architect, profile.architectReasoningEffort);
  const writerEffort = getModelEffort(writer, profile.writerReasoningEffort);
  const validVoice = voices.data?.some((voice) => voice.id === profile.ttsVoice);
  const ready = !!architect && !!writer && validVoice && !models.isError && !voices.isError;
  const speedLabel = `Narration speed · ${profile.ttsSpeed.toFixed(2)}×`;
  const speedValue = [profile.ttsSpeed];
  const submitLabel = form.isPending ? 'Queuing episode…' : 'Create episode';

  return (
    <form onSubmit={(event) => {
      if (!ready) { event.preventDefault(); return; }
      form.handleSubmit(event, { architectReasoningEffort: architectEffort, writerReasoningEffort: writerEffort });
    }} className="space-y-6">
      <fieldset disabled={form.isPending} className="space-y-6 rounded-2xl border bg-card p-5 sm:p-8">
        <legend className="sr-only">Episode settings</legend>
        <label className="grid gap-2 font-medium">
          What shall we explore tonight?
          <Input name="topic" value={form.topic} onChange={form.handleTopic}
            placeholder="A gentle journey through the hidden life of the ocean" required maxLength={2000} />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          {(['architect', 'writer'] as const).map((role) => <CatalogSelect key={role}
            label={role === 'architect' ? 'Architect model' : 'Writer model'} value={profile[`${role}Model`]}
            options={models.data ?? []} loading={models.isPending} error={models.isError} onRetry={() => { void models.refetch(); }}
            onChange={(value) => {
              const model = models.data?.find((item) => item.id === value);
              form.updateProfile({ [`${role}Model`]: value, [`${role}ReasoningEffort`]: getModelEffort(model, profile[`${role}ReasoningEffort`]) });
            }} />)}
          <ReasoningSelect label="Architect reasoning effort" value={architectEffort} options={architect?.reasoning.supportedEfforts ?? []} onChange={form.handleArchitectEffort} />
          <ReasoningSelect label="Writer reasoning effort" value={writerEffort} options={writer?.reasoning.supportedEfforts ?? []} onChange={form.handleWriterEffort} />
        </div>
        <p className="text-xs text-muted-foreground">Models and reasoning options come from Polza. Voice IDs come from the local Kokoro service; speed is configured separately.</p>
        <label className="grid gap-2 text-sm font-medium">Temperature
          <Input type="number" name="temperature" min={0} max={2} step={0.05} value={profile.temperature} onChange={form.handleProfile} required />
        </label>
        <CatalogSelect label="Narrator voice" value={profile.ttsVoice} options={voices.data ?? []}
          loading={voices.isPending} error={voices.isError} onRetry={() => { void voices.refetch(); }}
          onChange={(ttsVoice) => form.updateProfile({ ttsVoice })} />
        <div className="grid items-center gap-6 sm:grid-cols-2">
          <div className="space-y-4">
            <p className="text-sm font-medium">{speedLabel}</p>
            <Slider aria-label="Narration speed" value={speedValue} min={0.7} max={1.1} step={0.01} onValueChange={form.handleSpeed} />
            <p className="text-xs text-muted-foreground">0.70× · slower and softer → 1.10× · natural pace</p>
          </div>
          <ProfileTextField label="Maximum chunk characters" name="maxChunkChars" value={profile.maxChunkChars}
            onChange={form.handleProfile} type="number" />
        </div>
        <PromptStudio profile={profile} onChange={form.handleProfile} />
        <Button type="submit" size="lg" disabled={form.isPending || !ready}><Sparkles />{submitLabel}</Button>
      </fieldset>
    </form>
  );
};

export default ProjectForm;