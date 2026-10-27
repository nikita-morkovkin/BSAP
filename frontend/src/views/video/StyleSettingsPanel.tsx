import type { ChangeEvent } from 'react';
import Button from '@/components/ui/Button';
import type { VideoStyleConfig } from '@/types/video.types';
import { videoControls } from './consts/video-controls.const';
import { videoText } from './consts/video-text.const';
import StyleNumber from './StyleNumber';

type StyleSettingsPanelProps = { style: VideoStyleConfig; onChange: (style: VideoStyleConfig) => void };

const StyleSettingsPanel = ({ style, onChange }: StyleSettingsPanelProps) => {
  const preset = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = event.target.value === 'natural' ? [0, 1, 1, 1] : event.target.value === 'soft' ? [-0.12, 0.95, 0.85, 0.95] : [-0.22, 0.88, 0.75, 0.85];
    const [brightness, contrast, saturation, gamma] = values;

    onChange({ ...style, brightness, contrast, saturation, gamma, vignetteEnabled: true });
  };
  const reset = () => { onChange({ ...style, brightness: -0.22, contrast: 0.88, saturation: 0.75, gamma: 0.85, vignetteEnabled: true, crossfadeSec: 3, slowMoDefault: 1.25, slowMoMax: 2 }); };
  const vignette = (event: ChangeEvent<HTMLInputElement>) => { onChange({ ...style, vignetteEnabled: event.target.checked }); };
  const mirror = (event: ChangeEvent<HTMLInputElement>) => { onChange({ ...style, mirrorOnRepeat: event.target.checked }); };
  const transition = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;

    if (value === 'fade' || value === 'smoothleft' || value === 'dissolve') {
      onChange({ ...style, transition: value });
    }
  };
  const angle = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;

    if (value === 'PI/3' || value === 'PI/4' || value === 'PI/5' || value === 'PI/6') {
      onChange({ ...style, vignetteAngle: value });
    }
  };
  const reshuffle = () => { onChange({ ...style, seed: crypto.getRandomValues(new Uint32Array(1))[0] }); };

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">{videoText.style}</h3>
      <select aria-label={videoText.style} defaultValue="dark" onChange={preset}>
        <option value="dark">{videoText.dark}</option><option value="soft">{videoText.soft}</option><option value="natural">{videoText.natural}</option>
      </select>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {videoControls.map((control) => <StyleNumber key={control.key} control={control} style={style} onChange={onChange} />)}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label><input type="checkbox" checked={style.vignetteEnabled} onChange={vignette} /> {videoText.vignette}</label>
        <label>{videoText.angle} <select value={style.vignetteAngle} onChange={angle}><option>PI/3</option><option>PI/4</option><option>PI/5</option><option>PI/6</option></select></label>
        <label><input type="checkbox" checked={style.mirrorOnRepeat} onChange={mirror} /> {videoText.mirror}</label>
        <label>{videoText.transition} <select value={style.transition} onChange={transition}><option>fade</option><option>smoothleft</option><option>dissolve</option></select></label>
      </div>
      <Button variant="outline" onClick={reshuffle}>{videoText.reshuffle}</Button>
      <Button variant="outline" onClick={reset}>{videoText.reset}</Button>
    </section>
  );
};

export default StyleSettingsPanel;