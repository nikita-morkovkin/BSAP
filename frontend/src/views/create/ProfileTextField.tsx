import { Input } from '@/components/ui/Input';
import type { ProfileField, ProfileInputEvent } from '@/types/form.types';

type ProfileTextFieldProps = {
  label: string;
  name: ProfileField;
  value: string | number;
  onChange: (event: ProfileInputEvent) => void;
  type?: 'text' | 'number';
  list?: string;
};

const ProfileTextField = ({ label, name, value, onChange, type = 'text', list }: ProfileTextFieldProps) => {
  const isNumber = type === 'number';
  const min = isNumber ? 1 : undefined;
  const max = isNumber ? 200 : undefined;
  const step = isNumber ? 1 : undefined;

  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Input name={name} value={value} onChange={onChange} type={type}
        min={min} max={max} step={step} list={list} required />
    </label>
  );
};

export default ProfileTextField;