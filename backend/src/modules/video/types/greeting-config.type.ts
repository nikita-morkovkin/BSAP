import { z } from 'zod';
import { greetingSchema } from '../schemas/greeting.schema';

export type GreetingConfig = z.infer<typeof greetingSchema>;
