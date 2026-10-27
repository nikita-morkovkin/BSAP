export type GreetingConfig = {
  enabled: boolean; text: string; leadInSec: number; tailSec: number;
  nativeClipId?: string;
  lipSyncMode: 'vad_switch' | 'external_lipsync' | 'native_veo_audio';
  vad: { thresholdDb: number; minSpeechMs: number; minSilenceMs: number; hysteresisDb: number; windowMs: number };
  transitionMs: number; placement: 'pip_circle' | 'intro_fullscreen'; crossfadeSec: number;
  pip: { position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center'; sizePctOfHeight: number; marginPct: number; feather: number; fadeInSec: number; fadeOutSec: number };
};