import type { z } from 'zod';
import type { stateSchema } from '../schemas/state.schema';

export type State = z.infer<typeof stateSchema>;
