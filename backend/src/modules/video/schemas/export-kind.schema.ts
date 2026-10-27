import { z } from 'zod';

export const exportKindSchema = z.enum([
  'narration',
  'background_music',
  'mixed_audio',
  'video_loop',
  'video_full',
  'final_mp4',
  'greeting_clip',
]);
