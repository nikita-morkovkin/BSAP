/**
 * Return a deliberately approximate remaining-time estimate from elapsed wall
 * time and reported overall progress. Progress is not linear across stages, so
 * avoid presenting an estimate while the job is just starting or nearly done.
 */
export const approximateJobEta = (
  startedAt: string,
  progress: number,
  now: number,
): number | undefined => {
  if (!Number.isFinite(progress) || progress < 0.1 || progress >= 0.98) {
    return undefined;
  }

  const elapsedSeconds = (now - new Date(startedAt).getTime()) / 1000;

  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return undefined;
  }

  return Math.max(1, Math.round((elapsedSeconds * (1 - progress)) / progress));
};

export const formatApproximateJobEta = (seconds: number): string => {
  if (seconds < 60) {
    return `~${seconds}s remaining`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return remainder < 10
    ? `~${minutes}m remaining`
    : `~${minutes}m ${remainder}s remaining`;
};