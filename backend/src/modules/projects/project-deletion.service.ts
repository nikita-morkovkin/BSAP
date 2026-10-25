import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PIPELINE_JOBS } from '../queue/consts';
import { StateManagerService } from '../state/state-manager.service';

@Injectable()
export class ProjectDeletionService {
  private operation: Promise<void> = Promise.resolve();

  constructor(
    @InjectQueue(PIPELINE_JOBS.scriptQueue)
    private readonly scripts: Queue<{ projectId: string }>,
    @InjectQueue(PIPELINE_JOBS.textQueue)
    private readonly text: Queue<{ projectId: string }>,
    @InjectQueue(PIPELINE_JOBS.ttsQueue)
    private readonly tts: Queue<{ projectId: string }>,
    @InjectQueue(PIPELINE_JOBS.audioMasteringQueue)
    private readonly audio: Queue<{ projectId: string }>,
    private readonly stateManager: StateManagerService,
  ) {}

  public deleteProject(projectId: string): Promise<void> {
    const next = this.operation.then(() => this.removeProject(projectId));
    this.operation = next.catch(() => undefined);
    return next;
  }

  private async removeProject(projectId: string): Promise<void> {
    // Pause dispatch, not active work; never remove files beneath a running worker.
    const paused: Queue[] = [];
    try {
      for (const queue of [this.scripts, this.text, this.tts, this.audio]) {
        if (!(await queue.isPaused())) {
          await queue.pause();
          paused.push(queue);
        }
      }
      const queues = [this.scripts, this.text, this.tts, this.audio];
      for (const queue of queues) {
        const active = await queue.getJobs(['active']);
        if (active.some((job) => job.data.projectId === projectId)) {
          throw new ConflictException(
            'This episode is processing. Wait for it to finish before deleting it.',
          );
        }
      }
      for (const queue of queues) {
        // BullMQ v6 keeps paused jobs in the wait list and stops dispatch via metadata.
        const jobs = await queue.getJobs([
          'wait',
          'delayed',
          'failed',
          'completed',
          'waiting-children',
          'prioritized',
        ]);
        for (const job of jobs) {
          if (job.data.projectId === projectId) await job.remove();
        }
      }
      await this.stateManager.deleteProject(projectId);
    } finally {
      await Promise.all(paused.map((queue) => queue.resume()));
    }
  }
}
