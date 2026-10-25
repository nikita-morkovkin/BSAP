import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from 'cn';

type SelectTriggerProps = SelectPrimitive.Trigger.Props;
type SelectContentProps = SelectPrimitive.Popup.Props;
type SelectItemProps = SelectPrimitive.Item.Props;

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = ({ className, children, ...props }: SelectTriggerProps) => {
  const classes = cn('flex h-10 items-center justify-between gap-2 rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/30', className);

  return (
    <SelectPrimitive.Trigger className={classes} {...props}>
      {children}
      <SelectPrimitive.Icon><ChevronDown className="size-4" /></SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
};

const SelectContent = ({ className, children, ...props }: SelectContentProps) => {
  const classes = cn('max-h-(--available-height) min-w-(--anchor-width) overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg', className);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner sideOffset={4} className="z-50">
        <SelectPrimitive.Popup className={classes} {...props}>
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
};

const SelectItem = ({ className, children, ...props }: SelectItemProps) => {
  const classes = cn('flex cursor-pointer items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm outline-none data-highlighted:bg-accent', className);

  return (
    <SelectPrimitive.Item className={classes} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator><Check className="size-4" /></SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
};

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem };
export default Select;