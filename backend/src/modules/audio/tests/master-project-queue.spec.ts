import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { PIPELINE_JOBS } from '../../queue/consts/pipeline-jobs.const';
import { MasterProjectQueueService } from '../master-project-queue.service';

describe('MasterProjectQueueService', () => {
  it.each(['waiting', 'active', 'delayed'])(
    'does not duplicate a %s mastering job',
    async (status) => {
      const queue = {
        getJob: jest
          .fn()
          .mockResolvedValue({ getState: jest.fn().mockResolvedValue(status) }),
        add: jest.fn(),
      };
      const module = await Test.createTestingModule({
        providers: [
          MasterProjectQueueService,
          {
            provide: getQueueToken(PIPELINE_JOBS.audioMasteringQueue),
            useValue: queue,
          },
        ],
      }).compile();

      await module.get(MasterProjectQueueService).enqueueProject('001-stars');

      expect(queue.getJob).toHaveBeenCalledWith('master-001-stars');
      expect(queue.add).not.toHaveBeenCalled();

      await module.close();
    },
  );

  it('retries a failed job rather than creating another one', async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    const queue = {
      getJob: jest.fn().mockResolvedValue({
        getState: jest.fn().mockResolvedValue('failed'),
        retry,
      }),
      add: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        MasterProjectQueueService,
        {
          provide: getQueueToken(PIPELINE_JOBS.audioMasteringQueue),
          useValue: queue,
        },
      ],
    }).compile();

    await module.get(MasterProjectQueueService).enqueueProject('001-stars');

    expect(retry).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();

    await module.close();
  });

  it('replaces a completed master job when chapters are reassembled', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    const queue = {
      getJob: jest.fn().mockResolvedValue({
        getState: jest.fn().mockResolvedValue('completed'),
        remove,
      }),
      add: jest.fn().mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      providers: [
        MasterProjectQueueService,
        {
          provide: getQueueToken(PIPELINE_JOBS.audioMasteringQueue),
          useValue: queue,
        },
      ],
    }).compile();

    await module.get(MasterProjectQueueService).enqueueProject('001-stars');

    expect(remove).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      PIPELINE_JOBS.masterProject,
      { projectId: '001-stars' },
      expect.objectContaining({ jobId: 'master-001-stars', attempts: 6 }),
    );

    await module.close();
  });
});
