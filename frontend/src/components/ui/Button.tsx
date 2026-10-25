import { Button as ButtonPrimitive } from '@base-ui/react/button';
import type { VariantProps } from 'class-variance-authority';
import { cn } from 'cn';
import { buttonVariants } from '@/consts/button.consts';

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

const Button = ({ className, variant = 'default', size = 'default', ...props }: ButtonProps) => {
  const classes = cn(buttonVariants({ variant, size }), className);

  return <ButtonPrimitive data-slot="button" className={classes} {...props} />;
};

export { Button };
export default Button;