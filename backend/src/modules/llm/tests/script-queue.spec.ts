import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { PIPELINE_JOBS } from '../../queue/consts';
import { ScriptQueueService } from '../script-queue.service';

describe('ScriptQueueService recovery', () => {
  it.each(['waiting', 'active', 'delayed', 'failed', 'completed', 'missing'])(
    'handles %s jobs for both script generation and normalization',
    async (status) => {
      const job = {
        getState: jest.fn().mockResolvedValue(status),
        retry: jest.fn(),
        remove: jest.fn(),
      };
      const queue = {
        getJob: jest
          .fn()
          .mockResolvedValue(status === 'missing' ? undefined : job),
        add: jest.fn(),
      };
      const module = await Test.createTestingModule({
        providers: [
          ScriptQueueService,
          {
            provide: getQueueToken(PIPELINE_JOBS.scriptQueue),
            useValue: queue,
          },
          { provide: getQueueToken(PIPELINE_JOBS.textQueue), useValue: queue },
        ],
      }).compile();
      const service = module.get(ScriptQueueService);

      await service.enqueueProject('001-stars');
      await service.enqueueNormalization('001-stars');

      expect(queue.getJob).toHaveBeenCalledWith('scripts-001-stars');
      expect(queue.getJob).toHaveBeenCalledWith('normalize-001-stars');
      expect(job.retry).toHaveBeenCalledTimes(status === 'failed' ? 2 : 0);
      expect(job.remove).toHaveBeenCalledTimes(status === 'completed' ? 2 : 0);
      expect(queue.add).toHaveBeenCalledTimes(
        ['completed', 'missing'].includes(status) ? 2 : 0,
      );

      await module.close();
    },
  );
});
