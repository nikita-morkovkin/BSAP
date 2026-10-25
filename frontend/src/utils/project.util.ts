import { POLLING_INTERVAL_MS } from '@/consts/query.consts';
import type { Chapter, PipelineStatus, ProjectDetail, RegenerateChunkVariables } from '@/types/project.types';

export const projectPollingInterval = (status?: PipelineStatus): number | false => {
  if (status && !['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
    return POLLING_INTERVAL_MS;
  }

  return false;
};

export const sortedChapters = (chapters: Record<string, Chapter>): Chapter[] =>
  Object.values(chapters).sort((left, right) => left.chapterNumber - right.chapterNumber);

export const formatTimestamp = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000);

  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0')).join(':');
};

export const optimisticRegeneration = (
  detail: ProjectDetail, variables: RegenerateChunkVariables,
): ProjectDetail => {
  const chapter = detail.state.chapters[String(variables.chapterNumber)];

  if (!chapter) {
    return detail;
  }

  return {
    ...detail,
    state: {
      ...detail.state, status: 'SYNTHESIZING_AUDIO', error: undefined, outputFiles: {},
      chapters: {
        ...detail.state.chapters,
        [variables.chapterNumber]: {
          ...chapter, ttsStatus: 'PENDING', durationMs: 0,
          chunks: chapter.chunks.map((chunk) => chunk.id === variables.chunkId
            ? { ...chunk, ...variables.payload, status: 'PENDING', durationMs: 0 } : chunk),
        },
      },
    },
  };
};