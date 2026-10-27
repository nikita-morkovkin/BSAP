import { z } from 'zod';

export const greetingSchema = z.strictObject({
  enabled: z.boolean().default(false),
  text: z.string().trim().max(2000).default(''),
  nativeClipId: z
    .string()
    .regex(/^[a-f0-9]{16}$/)
    .optional(),
  leadInSec: z.number().min(0).max(5).default(0.6),
  tailSec: z.number().min(0).max(10).default(1.5),
  lipSyncMode: z
    .enum(['vad_switch', 'external_lipsync', 'native_veo_audio'])
    .default('vad_switch'),
  vad: z
    .strictObject({
      thresholdDb: z.number().min(-80).max(-5).default(-35),
      minSpeechMs: z.number().min(30).max(1000).default(120),
      minSilenceMs: z.number().min(30).max(2000).default(180),
      hysteresisDb: z.number().min(0).max(20).default(6),
      windowMs: z.number().min(10).max(100).default(30),
    })
    .prefault({}),
  transitionMs: z.number().min(0).max(500).default(200),
  placement: z.enum(['pip_circle', 'intro_fullscreen']).default('pip_circle'),
  crossfadeSec: z.number().min(0.1).max(3).default(1),
  pip: z
    .strictObject({
      position: z
        .enum([
          'bottom-right',
          'bottom-left',
          'top-right',
          'top-left',
          'center',
        ])
        .default('bottom-right'),
      sizePctOfHeight: z.number().min(10).max(80).default(28),
      marginPct: z.number().min(0).max(20).default(3),
      feather: z.number().min(0).max(0.2).default(0.02),
      fadeInSec: z.number().min(0).max(3).default(0.5),
      fadeOutSec: z.number().min(0).max(3).default(0.8),
    })
    .prefault({}),
});
