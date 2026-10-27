import { z } from 'zod';

export const videoStyleSchema = z
  .strictObject({
    width: z.number().int().min(160).max(3840).multipleOf(2).default(1920),
    height: z.number().int().min(90).max(2160).multipleOf(2).default(1080),
    fps: z.number().int().min(12).max(60).default(30),
    minClipDurationSec: z.number().min(8).max(60).default(14),
    maxClipDurationSec: z.number().min(0).max(300).default(45),
    slowMoDefault: z.number().min(1).max(2).default(1.25),
    slowMoMax: z.number().min(1).max(2).default(2),
    crossfadeSec: z.number().min(1).max(6).default(3),
    transition: z.enum(['fade', 'smoothleft', 'dissolve']).default('fade'),
    brightness: z.number().min(-1).max(1).default(-0.22),
    contrast: z.number().min(0.5).max(1.5).default(0.88),
    saturation: z.number().min(0).max(1.5).default(0.75),
    gamma: z.number().min(0.5).max(1.5).default(0.85),
    vignetteEnabled: z.boolean().default(true),
    vignetteAngle: z.enum(['PI/3', 'PI/4', 'PI/5', 'PI/6']).default('PI/4'),
    mirrorOnRepeat: z.boolean().default(true),
    cycleTargetMinutes: z.number().min(0.25).max(90).default(45),
    seed: z.number().int().min(0).max(4294967295).default(1),
  })
  .refine((style) => style.slowMoMax >= style.slowMoDefault, {
    message: 'Maximum slow motion must be at least the default factor',
  })
  .refine(
    (style) =>
      style.maxClipDurationSec === 0 ||
      style.maxClipDurationSec >= style.minClipDurationSec,
    {
      message:
        'Maximum duration must be zero (disabled) or at least the minimum',
    },
  )
  .refine((style) => style.minClipDurationSec > style.crossfadeSec * 2, {
    message: 'Minimum clip length must exceed two crossfades',
  });
