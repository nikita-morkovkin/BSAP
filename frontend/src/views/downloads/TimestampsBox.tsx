import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useTimestamps } from '@/hooks/queries/useTimestamps.hook';

type TimestampsBoxProps = { projectId: string; revision: string; available: boolean };

const TimestampsBox = ({ projectId, revision, available }: TimestampsBoxProps) => {
  const query = useTimestamps({ id: projectId, revision, enabled: available });
  const text = query.data ?? '';
  const disabled = !text;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('YouTube timestamps copied');
    } catch {
      toast.error('Clipboard unavailable. Select and copy the timestamps manually.');
    }
  };
  const handleRetry = () => { query.refetch(); };

  return (
    <div className="space-y-3">
      <label htmlFor="youtube-timestamps" className="text-sm font-medium">YouTube timestamps</label>
      <Textarea id="youtube-timestamps" value={text} readOnly className="h-52 overflow-auto font-mono text-xs"
        placeholder="Timestamps appear when mastering finishes." />
      <Button variant="outline" onClick={handleCopy} disabled={disabled}>Copy timestamps</Button>
      {query.isError && <Button variant="ghost" onClick={handleRetry}>Retry timestamps</Button>}
    </div>
  );
};

export default TimestampsBox;