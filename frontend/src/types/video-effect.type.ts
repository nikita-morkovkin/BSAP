export type VideoEffect = {
  id: string; name: string; source: 'uploaded' | 'preset'; hasAlpha: boolean;
  blend: 'screen' | 'add' | 'overlay_alpha'; opacity: number; speed: number;
  scale: number; maxBrightness: number; durationSec: number;
};