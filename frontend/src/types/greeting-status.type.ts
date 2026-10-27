import type { GreetingConfig } from './greeting-config.type';

export type GreetingStatus = {
  config: GreetingConfig;
  audio?: { path: string; startSec: number; endSec: number };
  preview?: string;
};