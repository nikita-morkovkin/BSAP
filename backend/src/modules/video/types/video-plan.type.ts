import type { PlanItem } from './plan-item.type';

export type VideoPlan = {
  items: PlanItem[];
  crossfade: number;
  loopWindow?: { startSec: number; endSec: number };
  totalSec: number;
  planHash: string;
};
