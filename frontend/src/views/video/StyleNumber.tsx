import type { ChangeEvent } from 'react';
import type { VideoStyleConfig } from '@/types/video.types';
import { videoText } from './consts/video-text.const';
import { videoControls } from './consts/video-controls.const';

type StyleNumberProps = {
  control: typeof videoControls[number];
  style: VideoStyleConfig;
  onChange: (style: VideoStyleConfig) => void;
};

const StyleNumber = ({ control, style, onChange }: StyleNumberProps) => {
  const value = style[control.key];
  const label = videoText[control.key];
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);

    if (Number.isFinite(next)) {
      onChange({ ...style, [control.key]: next });
    }
  };

  return (
    <label className="space-y-1 text-sm">
      <span className="block">{label}</span>
      <input type="range" aria-label={label} min={control.min} max={control.max} step={control.step} value={value} onChange={handleChange} className="w-full" />
      <input type="number" aria-label={label} min={control.min} max={control.max} step={control.step} value={value} onChange={handleChange} className="w-full rounded border p-1" />
    </label>
  );
};

export default StyleNumber;