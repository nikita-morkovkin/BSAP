import type { ComponentProps } from 'react';
import { cn } from 'cn';

type BadgeProps = ComponentProps<'span'> & { variant?: 'default' | 'secondary' | 'outline' | 'destructive' };

const Badge = ({ className, variant = 'default', ...props }: BadgeProps) => {
  const tone = variant === 'destructive' ? 'bg-destructive/10 text-destructive'
    : variant === 'outline' ? 'border-border text-muted-foreground'
      : variant === 'secondary' ? 'border-transparent bg-secondary text-secondary-foreground'
        : 'border-transparent bg-primary text-primary-foreground';
  const classes = cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', tone, className);

  return <span data-slot="badge" className={classes} {...props} />;
};

export { Badge };
export default Badge;