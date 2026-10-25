import type { ReasoningEffort } from '@/types/project.types';

type ReasoningSelectProps = {
  label: string;
  value: ReasoningEffort;
  onChange: (value: ReasoningEffort | null) => void;
  options: string[];
};

const ReasoningSelect = ({ label, value, onChange, options }: ReasoningSelectProps) => {
  return (
    <div className="grid gap-2 text-sm font-medium">
      <select aria-label={label} className="w-full rounded-xl border bg-background p-3" value={options.length ? value : 'none'}
        disabled={!options.length} onChange={(event) => onChange(event.target.value)}>
        {options.length ? options.map((effort) => <option key={effort} value={effort}>{effort}</option>)
          : <option value="none">Not configurable for this model</option>}
      </select>
      <span className="order-first">{label}</span>
    </div>
  );
};

export default ReasoningSelect;