import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";
import type { ComponentProps } from "react";

type InputProps = ComponentProps<"input">;

const Input = ({ className, ...props }: InputProps) => {
  const classes = cn(
    "h-10 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50",
    className,
  );

  return <InputPrimitive data-slot="input" className={classes} {...props} />;
};

export { Input };
export default Input;
