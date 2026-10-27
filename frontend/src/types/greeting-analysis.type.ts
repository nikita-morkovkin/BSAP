export type GreetingAnalysis = {
  peaks: number[]; segments: { start: number; end: number; speaking: boolean }[];
  startSec: number; endSec: number;
};