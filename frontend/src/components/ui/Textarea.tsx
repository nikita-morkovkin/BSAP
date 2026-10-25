import type { ComponentProps } from 'react';
import { cn } from 'cn';

type TextareaProps = ComponentProps<'textarea'>;

const Textarea = ({ className, ...props }: TextareaProps) => {
  const classes = cn('min-h-24 w-full resize-y rounded-xl border bg-background px-3 py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50', className);

  return <textarea data-slot="textarea" className={classes} {...props} />;
};

export { Textarea };
export default Textarea;