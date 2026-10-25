export const queryKeys = {
  projects: ['projects'] as const,
  defaults: ['project-defaults'] as const,
  project: (id: string) => ['project', id] as const,
  timestamps: (id: string, revision: string) => ['timestamps', id, revision] as const,
};

export const POLLING_INTERVAL_MS = 1500;