import Select, {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import type { ReasoningEffort } from "@/types/project.types";

type ReasoningSelectProps = {
  label: string;
  value: ReasoningEffort;
  onChange: (value: ReasoningEffort | null) => void;
  options: string[];
};

const ReasoningSelect = ({
  label,
  value,
  onChange,
  options,
}: ReasoningSelectProps) => {
  return (
    <div className="grid gap-2 text-sm font-medium">
      <Select
        value={options.length ? value : null}
        disabled={!options.length}
        onValueChange={onChange}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue
            placeholder={options.length ? "Select effort" : "Not configurable for this model"}
          />
        </SelectTrigger>
        <SelectContent>
          {options.map((effort) => (
            <SelectItem key={effort} value={effort}>
              {effort}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="order-first">{label}</span>
    </div>
  );
};

export default ReasoningSelect;
