import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import { PIPELINE_JOBS } from '../../queue/consts';
import { ProjectDeletionService } from '../project-deletion.service';
import { StateManagerService } from '../../state/state-manager.service';

describe('Project deletion queue safety', () => {
  const makeQueue = () => ({
    isPaused: jest.fn().mockResolvedValue(false),
    pause: jest.fn(),
    resume: jest.fn(),
    getJobs: jest.fn().mockResolvedValue([]),
  });
  const setup = async () => {
    const queues = Array.from({ length: 4 }, makeQueue);
    const manager = {
      deleteProject: jest.fn(),
      getState: jest.fn().mockResolvedValue({}),
    };
    const names = [
      PIPELINE_JOBS.scriptQueue,
      PIPELINE_JOBS.textQueue,
      PIPELINE_JOBS.ttsQueue,
      PIPELINE_JOBS.audioMasteringQueue,
    ];
    const module = await Test.createTestingModule({
      providers: [
        ProjectDeletionService,
        { provide: StateManagerService, useValue: manager },
        ...names.map((name, index) => ({
          provide: getQueueToken(name),
          useValue: queues[index],
        })),
      ],
    }).compile();

    return { queues, manager, service: module.get(ProjectDeletionService) };
  };

  it('removes only matching jobs and restores dispatch', async () => {
    const { queues, manager, service } = await setup();
    const remove = jest.fn();
    const other = jest.fn();
    queues[0].getJobs.mockImplementation((states: string[]) =>
      Promise.resolve(
        states.includes('active')
          ? []
          : [
              { data: { projectId: '001-stars' }, remove },
              { data: { projectId: '002-ocean' }, remove: other },
            ],
      ),
    );
    await service.deleteProject('001-stars');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(manager.deleteProject).toHaveBeenCalledWith('001-stars');
    queues.forEach((queue) => expect(queue.resume).toHaveBeenCalledTimes(1));
  });

  it('rejects active work without removing any files or jobs', async () => {
    const { queues, manager, service } = await setup();
    queues[2].getJobs.mockResolvedValue([{ data: { projectId: '001-stars' } }]);
    await expect(service.deleteProject('001-stars')).rejects.toMatchObject({
      status: 409,
    });
    expect(manager.deleteProject).not.toHaveBeenCalled();
    queues.forEach((queue) => expect(queue.resume).toHaveBeenCalledTimes(1));
  });

  it('rejects deletion beneath a queued or running video worker', async () => {
    const { queues, manager, service } = await setup();

    manager.getState.mockResolvedValue({
      video: { job: { stage: 'rendering_chunks' } },
    });

    await expect(service.deleteProject('001-stars')).rejects.toMatchObject({
      status: 409,
    });

    expect(manager.deleteProject).not.toHaveBeenCalled();
    expect(queues[0].pause).not.toHaveBeenCalled();
  });
});
