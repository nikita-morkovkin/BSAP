export type ScriptJob =
  | { projectId: string; chapterNumber?: never }
  | { projectId: string; chapterNumber: number };
