import { Queue } from 'bullmq';
import { ProjectDeletionService } from '../project-deletion.service';
import { StateManagerService } from '../../state/state-manager.service';

describe('Project deletion queue safety', () => {
  const makeQueue = () => ({
    isPaused: jest.fn().mockResolvedValue(false),
    pause: jest.fn(),
    resume: jest.fn(),
    getJobs: jest.fn().mockResolvedValue([]),
  });
  it('removes only matching jobs and restores dispatch', async () => {
    const queues = Array.from({ length: 4 }, makeQueue);
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
    const manager = { deleteProject: jest.fn() };
    const service = new ProjectDeletionService(
      queues[0] as unknown as Queue<{ projectId: string }>,
      queues[1] as unknown as Queue<{ projectId: string }>,
      queues[2] as unknown as Queue<{ projectId: string }>,
      queues[3] as unknown as Queue<{ projectId: string }>,
      manager as unknown as StateManagerService,
    );
    await service.deleteProject('001-stars');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(manager.deleteProject).toHaveBeenCalledWith('001-stars');
    queues.forEach((queue) => expect(queue.resume).toHaveBeenCalledTimes(1));
  });

  it('rejects active work without removing any files or jobs', async () => {
    const queues = Array.from({ length: 4 }, makeQueue);
    queues[2].getJobs.mockResolvedValue([{ data: { projectId: '001-stars' } }]);
    const manager = { deleteProject: jest.fn() };
    const service = new ProjectDeletionService(
      queues[0] as unknown as Queue<{ projectId: string }>,
      queues[1] as unknown as Queue<{ projectId: string }>,
      queues[2] as unknown as Queue<{ projectId: string }>,
      queues[3] as unknown as Queue<{ projectId: string }>,
      manager as unknown as StateManagerService,
    );
    await expect(service.deleteProject('001-stars')).rejects.toMatchObject({
      status: 409,
    });
    expect(manager.deleteProject).not.toHaveBeenCalled();
    queues.forEach((queue) => expect(queue.resume).toHaveBeenCalledTimes(1));
  });
});
