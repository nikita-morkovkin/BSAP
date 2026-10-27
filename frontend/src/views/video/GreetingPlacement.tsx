import type { ChangeEvent } from 'react';
import type { GreetingConfig } from '@/types/greeting-config.type';

type GreetingPlacementProps = { config: GreetingConfig; change: (config: GreetingConfig) => void };

const GreetingPlacement = ({ config, change }: GreetingPlacementProps) => {
  const placement = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;

    if (value === 'pip_circle' || value === 'intro_fullscreen') {
      change({ ...config, placement: value });
    }
  };
  const position = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;

    if (value === 'bottom-right' || value === 'bottom-left' || value === 'top-right' || value === 'top-left' || value === 'center') {
      change({ ...config, pip: { ...config.pip, position: value } });
    }
  };
  const pip = (event: ChangeEvent<HTMLInputElement>) => { change({ ...config, pip: { ...config.pip, [event.target.name]: Number(event.target.value) } }); };
  const vad = (event: ChangeEvent<HTMLInputElement>) => { change({ ...config, vad: { ...config.vad, [event.target.name]: Number(event.target.value) } }); };

  return (
    <div className="grid gap-3 text-sm md:grid-cols-2">
      <label>Placement<select value={config.placement} onChange={placement}><option value="pip_circle">Circle badge</option><option value="intro_fullscreen">Fullscreen intro</option></select></label>
      <label>Position<select value={config.pip.position} onChange={position}><option>bottom-right</option><option>bottom-left</option><option>top-right</option><option>top-left</option><option>center</option></select></label>
      <label>Size (% of height)<input name="sizePctOfHeight" type="range" min="10" max="80" value={config.pip.sizePctOfHeight} onChange={pip} /></label>
      <label>Feather<input name="feather" type="range" min="0" max="0.2" step="0.005" value={config.pip.feather} onChange={pip} /></label>
      <label>Fade in (s)<input name="fadeInSec" type="number" min="0" max="3" step="0.1" value={config.pip.fadeInSec} onChange={pip} /></label>
      <label>Fade out (s)<input name="fadeOutSec" type="number" min="0" max="3" step="0.1" value={config.pip.fadeOutSec} onChange={pip} /></label>
      <label>VAD threshold (dB)<input name="thresholdDb" type="range" min="-80" max="-5" value={config.vad.thresholdDb} onChange={vad} /></label>
      <label>Minimum speech (ms)<input name="minSpeechMs" type="number" min="30" max="1000" value={config.vad.minSpeechMs} onChange={vad} /></label>
      <label>Minimum silence (ms)<input name="minSilenceMs" type="number" min="30" max="2000" value={config.vad.minSilenceMs} onChange={vad} /></label>
    </div>
  );
};

export default GreetingPlacement;