import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useRegenerateChunkMutation } from "@/hooks/mutations/useRegenerateChunkMutation.hook";
import type {
  Chunk,
  Profile,
  RegenerateChunkPayload,
} from "@/types/project.types";
import { Dialog } from "@base-ui/react/dialog";
import { useState, type ChangeEvent, type SyntheticEvent } from "react";
import CatalogSelect from '@/components/common/CatalogSelect';
import { useVoices } from '@/hooks/queries/useSettings.hook';

type RegenerateChunkDialogProps = {
  projectId: string;
  chapterNumber: number;
  chunk: Chunk;
  profile: Profile;
  disabled: boolean;
};

const RegenerateChunkDialog = ({
  projectId,
  chapterNumber,
  chunk,
  profile,
  disabled,
}: RegenerateChunkDialogProps) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RegenerateChunkPayload>({});
  const mutation = useRegenerateChunkMutation({ id: projectId });
  const voices = useVoices();
  const text = draft.text ?? chunk.text;
  const voice = draft.ttsVoice ?? chunk.ttsVoice ?? profile.ttsVoice;
  const speed = draft.ttsSpeed ?? chunk.ttsSpeed ?? profile.ttsSpeed;
  const pause = draft.pauseAfterMs ?? chunk.pauseAfterMs;
  const buttonDisabled = disabled || mutation.isPending;
  const submitLabel = mutation.isPending ? "Queuing…" : "Regenerate chunk";

  const handleOpenChange = (nextOpen: boolean) => {
    if (!mutation.isPending) {
      setDraft({});
      setOpen(nextOpen);
    }
  };
  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    const nextValue = ["ttsSpeed", "pauseAfterMs"].includes(name)
      ? Number(value)
      : value;

    setDraft((current) => ({ ...current, [name]: nextValue }));
  };
  const handleSuccess = () => setOpen(false);
  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate(
      {
        chapterNumber,
        chunkId: chunk.id,
        payload: {
          text: text.trim(),
          ttsVoice: voice.trim(),
          ttsSpeed: speed,
          pauseAfterMs: pause,
        },
      },
      { onSuccess: handleSuccess },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        render={<Button variant="outline" disabled={buttonDisabled} />}
      >
        Edit / regenerate
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl -translate-1/2 overflow-auto rounded-2xl border bg-background p-6 shadow-xl">
          <Dialog.Title className="text-xl font-semibold">
            Refine this moment
          </Dialog.Title>
          <Dialog.Description className="my-3 text-sm text-muted-foreground">
            Regenerating rebuilds the chapter and master exports. Use spoken
            English, at most two hundred characters.
          </Dialog.Description>
          <form onSubmit={handleSubmit} className="space-y-4">
            <fieldset disabled={mutation.isPending} className="space-y-4">
              <label className="grid gap-2 text-sm">
                Narration
                <Textarea
                  name="text"
                  value={text}
                  onChange={handleChange}
                  maxLength={200}
                  required
                />
              </label>
              <CatalogSelect label="Narrator voice" value={voice} options={voices.data ?? []}
                loading={voices.isPending} error={voices.isError} onRetry={() => { void voices.refetch(); }}
                onChange={(ttsVoice) => setDraft((current) => ({ ...current, ttsVoice }))} />
              <label className="grid gap-2 text-sm">
                Speed
                <Input
                  name="ttsSpeed"
                  type="number"
                  value={speed}
                  onChange={handleChange}
                  min={0.7}
                  max={1.1}
                  step={0.01}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm">
                Pause after (milliseconds)
                <Input
                  name="pauseAfterMs"
                  type="number"
                  value={pause}
                  onChange={handleChange}
                  min={0}
                  step={1}
                  required
                />
              </label>
            </fieldset>
            {mutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                Regeneration failed. Your original chunk has been restored.
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Dialog.Close
                render={
                  <Button variant="outline" disabled={mutation.isPending} />
                }
              >
                Cancel
              </Dialog.Close>
              <Button type="submit" disabled={mutation.isPending || voices.isError || !voices.data?.some((item) => item.id === voice)}>
                {submitLabel}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default RegenerateChunkDialog;
