import { Slider as SliderPrimitive } from '@base-ui/react/slider';
import { cn } from 'cn';

type SliderProps = SliderPrimitive.Root.Props;

const Slider = ({ className, ...props }: SliderProps) => {
  const classes = cn('w-full', className);

  return (
    <SliderPrimitive.Root className={classes} {...props}>
      <SliderPrimitive.Control className="relative flex h-5 w-full touch-none items-center">
        <SliderPrimitive.Track className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Indicator className="h-full bg-primary" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="size-5 rounded-full border bg-background shadow outline-none focus-visible:ring-3 focus-visible:ring-ring" />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
};

export { Slider };
export default Slider;