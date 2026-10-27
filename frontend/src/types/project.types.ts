import type { ProjectMusic } from './music.types';

export type ReasoningEffort = string;
export type PipelineStatus = 'IDLE' | 'IN_PROGRESS' | 'GENERATING_OUTLINE'
  | 'GENERATING_SCRIPTS' | 'SYNTHESIZING_AUDIO' | 'MASTERING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type WorkStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type MediaArtifact = 'wav' | 'flac' | 'timestamps' | 'markers' | 'narration' | 'backgroundMusic';

export type Profile = {
  architectModel: string;
  writerModel: string;
  architectReasoningEffort: ReasoningEffort;
  writerReasoningEffort: ReasoningEffort;
  temperature: number;
  architectSystemPrompt: string;
  writerSystemPrompt: string;
  ttsVoice: string;
  ttsSpeed: number;
  maxChunkChars: number;
  masteringConfig: Record<string, number>;
};

export type Chunk = {
  id: string;
  index: number;
  text: string;
  pauseAfterMs: number;
  status: WorkStatus;
  filePath: string;
  durationMs: number;
  ttsVoice?: string;
  ttsSpeed?: number;
};

export type Chapter = {
  chapterNumber: number;
  title: string;
  scriptStatus: WorkStatus;
  ttsStatus: WorkStatus;
  scriptFilePath: string;
  audioFilePath: string;
  durationMs: number;
  chunks: Chunk[];
};

export type ProjectSummary = {
  projectId: string;
  topic: string;
  createdAt: string;
  updatedAt: string;
  status: PipelineStatus;
  error?: string;
};

export type ProjectState = ProjectSummary & {
  music?: ProjectMusic;
  mixRevision?: number;
  mixNeedsRebuild?: boolean;
  profile: Profile;
  outlineCompleted: boolean;
  chapters: Record<string, Chapter>;
  outputFiles: Partial<Record<MediaArtifact, string>>;
};

export type OutlineChapter = {
  chapterNumber: number;
  title: string;
  keyScientificFacts: string[];
  sensoryThemes: string[];
  targetWordCount: number;
};

export type ProjectDetail = {
  productionBusy?: boolean;
  state: ProjectState;
  outline: { topic: string; totalChapters: number; chapters: OutlineChapter[] } | null;
};

export type CreateProjectPayload = { topic: string; profile: Profile; selectedTrackIds?: string[] };
export type RegenerateChunkPayload = Partial<Pick<Chunk, 'text' | 'ttsVoice' | 'ttsSpeed' | 'pauseAfterMs'>>;
export type RegenerateChunkVariables = {
  chapterNumber: number;
  chunkId: string;
  payload: RegenerateChunkPayload;
};
export type RegenerationContext = { previous: ProjectDetail | undefined };