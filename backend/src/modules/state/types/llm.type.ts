import type { Outline } from './outline.type';
import type { Profile } from './profile.type';

export interface ILlmService {
  generateOutline(topic: string, profile: Profile): Promise<Outline>;
  generateChapterScript(
    outline: Outline,
    chapterNumber: number,
    profile: Profile,
    previousChapterTail?: string,
  ): Promise<string>;
}
