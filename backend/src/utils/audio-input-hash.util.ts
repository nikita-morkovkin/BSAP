import { createHash } from 'crypto';
import type { State } from '../modules/state/types/state.type';

export const audioInputHash = (state: State): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        voice: state.profile.ttsVoice,
        speed: state.profile.ttsSpeed,
        mastering: state.profile.masteringConfig,
        music: state.music,
        chapters: Object.values(state.chapters)
          .sort((a, b) => a.chapterNumber - b.chapterNumber)
          .map((chapter) => ({
            duration: chapter.durationMs,
            chunks: chapter.chunks,
          })),
      }),
    )
    .digest('hex');
