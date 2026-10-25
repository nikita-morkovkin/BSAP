export const PIPELINE_JOBS = {
  scriptQueue: 'script',
  generateProject: 'generate-project-scripts',
  generateChapter: 'generate-chapter-script',
  textQueue: 'text',
  normalizeProject: 'normalize-and-chunk-project',
  ttsQueue: 'tts-queue',
  synthesizeChunk: 'synthesize-chunk',
  audioMasteringQueue: 'audio-mastering',
  assembleChapter: 'assemble-chapter',
  masterProject: 'master-project',
} as const;
