import { Queue } from 'bullmq';

export async function enqueueRecoverableJob<T>(
  queue: Queue<T>,
  name: Parameters<Queue<T>['add']>[0],
  data: Parameters<Queue<T>['add']>[1],
  jobId: string,
): Promise<void> {
  const existing = await queue.getJob(jobId);

  if (existing) {
    const status = await existing.getState();

    if (status === 'failed') {
      await existing.retry();

      return;
    }

    if (status !== 'completed') {
      return;
    }

    await existing.remove();
  }

  await queue.add(name, data, {
    jobId,
    attempts: 6,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: false,
    removeOnFail: false,
  });
}
