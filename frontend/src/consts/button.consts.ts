import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/85',
        outline: 'border-border bg-background hover:bg-muted',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'border-transparent hover:bg-muted',
        destructive: 'border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20',
        link: 'border-transparent text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 gap-2 px-4',
        xs: 'h-6 gap-1 px-2 text-xs',
        sm: 'h-8 gap-1 px-3',
        lg: 'h-11 gap-2 px-5',
        icon: 'size-9',
        'icon-xs': 'size-6',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);