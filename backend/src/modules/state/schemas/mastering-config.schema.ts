import { z } from 'zod';

export const masteringConfigSchema = z.strictObject({
  highpassHz: z.number().positive().default(75),
  warmthFrequencyHz: z.number().positive().default(135),
  warmthGainDb: z.number().min(-24).max(24).default(2.5),
  deesserIntensity: z.number().min(0).max(1).default(0.4),
  lowpassHz: z.number().positive().default(6500),
  compressorThresholdDb: z.number().min(-60).max(0).default(-20),
  compressorRatio: z.number().min(1).max(20).default(3),
  loudnessLufs: z.number().min(-70).max(-5).default(-18),
  truePeakDb: z.number().min(-9).max(0).default(-2),
  loudnessRange: z.number().min(1).max(50).default(7),
  ambientVolumeDb: z.number().min(-96).max(0).default(-32),
  ambientSpeed: z.number().min(0.5).max(2).default(0.65),
  ambientCrossfadeSeconds: z.number().nonnegative().default(15),
  paddingSeconds: z.number().nonnegative().default(15),
  fadeOutSeconds: z.number().positive().default(10),
});
