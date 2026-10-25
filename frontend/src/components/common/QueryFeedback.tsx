import { Button } from '@/components/ui/Button';

type QueryFeedbackProps = { error?: boolean; message: string; onRetry?: () => void };

const QueryFeedback = ({ error = false, message, onRetry }: QueryFeedbackProps) => {
  const role = error ? 'alert' : 'status';

  return (
    <div className="rounded-2xl border bg-card p-8 text-center" role={role}>
      <p className="mb-4 text-muted-foreground">{message}</p>
      {error && onRetry && <Button onClick={onRetry} variant="outline">Try again</Button>}
    </div>
  );
};

export default QueryFeedback;