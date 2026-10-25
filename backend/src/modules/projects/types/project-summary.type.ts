import type { State } from '../../state/types';

export type ProjectSummary = Pick<
  State,
  'projectId' | 'topic' | 'createdAt' | 'updatedAt' | 'status' | 'error'
>;
