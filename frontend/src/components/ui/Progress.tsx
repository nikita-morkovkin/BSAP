import { Progress as ProgressPrimitive } from '@base-ui/react/progress';
import { cn } from 'cn';

type ProgressProps = ProgressPrimitive.Root.Props;

const Progress = ({ className, children, ...props }: ProgressProps) => {
  const classes = cn('w-full', className);

  return (
    <ProgressPrimitive.Root className={classes} {...props}>
      {children}
      <ProgressPrimitive.Track className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <ProgressPrimitive.Indicator className="h-full bg-primary transition-all" />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  );
};

export { Progress };
export default Progress;