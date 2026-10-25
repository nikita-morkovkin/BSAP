import type { Profile } from './profile.type';

export interface ITtsAdapter {
  /** Streams WAV audio to outputPath; the worker validates duration with ffprobe. */
  synthesize(text: string, outputPath: string, profile: Profile): Promise<void>;
}
