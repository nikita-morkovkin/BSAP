import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from 'cn';

type TabsProps = TabsPrimitive.Root.Props;
type TabsListProps = TabsPrimitive.List.Props;
type TabsTriggerProps = TabsPrimitive.Tab.Props;
type TabsContentProps = TabsPrimitive.Panel.Props;

const Tabs = ({ className, ...props }: TabsProps) => {
  const classes = cn('flex flex-col gap-3', className);

  return <TabsPrimitive.Root className={classes} {...props} />;
};

const TabsList = ({ className, ...props }: TabsListProps) => {
  const classes = cn('inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full bg-muted p-1', className);

  return <TabsPrimitive.List className={classes} {...props} />;
};

const TabsTrigger = ({ className, ...props }: TabsTriggerProps) => {
  const classes = cn('rounded-full px-4 py-2 text-sm font-medium text-muted-foreground outline-none data-active:bg-background data-active:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40', className);

  return <TabsPrimitive.Tab className={classes} {...props} />;
};

const TabsContent = ({ className, ...props }: TabsContentProps) => {
  const classes = cn('min-w-0 outline-none', className);

  return <TabsPrimitive.Panel className={classes} {...props} />;
};

export { Tabs, TabsList, TabsTrigger, TabsContent };
export default Tabs;