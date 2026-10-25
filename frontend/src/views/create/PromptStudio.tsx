import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Textarea';
import type { Profile } from '@/types/project.types';
import type { ProfileInputEvent } from '@/types/form.types';

type PromptStudioProps = { profile: Profile; onChange: (event: ProfileInputEvent) => void };

const PromptStudio = ({ profile, onChange }: PromptStudioProps) => {
  return (
    <details className="rounded-2xl border p-5">
      <summary className="cursor-pointer font-semibold">Prompt studio · advanced</summary>
      <p className="my-3 text-sm text-muted-foreground">Overrides apply only to this episode. Keep narration in English and gently paced.</p>
      <Tabs defaultValue="architect">
        <TabsList>
          <TabsTrigger value="architect">architect.system.md</TabsTrigger>
          <TabsTrigger value="writer">writer.system.md</TabsTrigger>
        </TabsList>
        <TabsContent value="architect">
          <Textarea aria-label="Architect system prompt" name="architectSystemPrompt"
            value={profile.architectSystemPrompt} onChange={onChange} className="h-80 overflow-auto font-mono text-xs" required />
        </TabsContent>
        <TabsContent value="writer">
          <Textarea aria-label="Writer system prompt" name="writerSystemPrompt"
            value={profile.writerSystemPrompt} onChange={onChange} className="h-80 overflow-auto font-mono text-xs" required />
        </TabsContent>
      </Tabs>
    </details>
  );
};

export default PromptStudio;