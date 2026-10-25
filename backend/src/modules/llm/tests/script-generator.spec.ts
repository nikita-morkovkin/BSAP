import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { PIPELINE_JOBS } from '../../queue/consts/pipeline-jobs.const';
import { profileSchema } from '../../state/schemas/profile.schema';
import { StateManagerService } from '../../state/state-manager.service';
import { PolzaLlmService } from '../polza-llm.service';
import { PromptService } from '../prompt.service';
import { ScriptGeneratorService } from '../script-generator.service';
import { ScriptQueueService } from '../script-queue.service';
import { ScriptProcessor } from '../script.processor';
import { LlmRequest } from '../types';

describe('Two-chapter script production and disk recovery', () => {
  let directory: string;
  let projectId: string;
  let stateManager: StateManagerService;
  let service: ScriptGeneratorService;
  let llm: PolzaLlmService;
  let prompts: PromptService;
  let queue: ScriptQueueService;
  let add: jest.Mock;
  let architect: jest.SpyInstance<Promise<string>, [LlmRequest]>;
  let writer: jest.SpyInstance<Promise<string>, [LlmRequest]>;

  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'bsap-scripts-'));
    add = jest.fn().mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        StateManagerService,
        PolzaLlmService,
        PromptService,
        ScriptQueueService,
        ScriptGeneratorService,
        ScriptProcessor,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            PROJECTS_DIR: directory,
            PROMPTS_DIR: resolve(__dirname, '../../../../../prompts'),
            POLZA_API_URL: 'http://127.0.0.1/v1',
            POLZA_API_KEY: 'test-key',
          }),
        },
        {
          provide: getQueueToken(PIPELINE_JOBS.scriptQueue),
          useValue: { add: jest.fn(), getJob: jest.fn() },
        },
        {
          provide: getQueueToken(PIPELINE_JOBS.textQueue),
          useValue: { add, getJob: jest.fn() },
        },
      ],
    }).compile();

    stateManager = module.get(StateManagerService);
    service = module.get(ScriptGeneratorService);
    llm = module.get(PolzaLlmService);
    prompts = module.get(PromptService);
    queue = module.get(ScriptQueueService);

    const state = await stateManager.initProject(
      'Quiet Stars',
      profileSchema.parse({
        architectModel: 'architect',
        writerModel: 'writer',
        architectReasoningEffort: 'high',
        writerReasoningEffort: 'high',
        temperature: 0.7,
        architectSystemPrompt: 'Make two chapters for a test.',
        writerSystemPrompt: 'Keep it gentle.',
        ttsVoice: 'narrator',
        ttsSpeed: 0.85,
        masteringConfig: {},
      }),
    );

    projectId = state.projectId;
    architect = jest.spyOn(llm, 'generateText').mockResolvedValue(
      `\`\`\`json\n${JSON.stringify({
        topic: 'Quiet Stars',
        totalChapters: 2,
        chapters: [1, 2].map((chapterNumber) => ({
          chapterNumber,
          title: `Starlight ${chapterNumber}`,
          keyScientificFacts: ['Stars produce light through nuclear fusion.'],
          sensoryThemes: ['Soft light'],
          targetWordCount: 900,
        })),
      })}\n\`\`\``,
    );
    writer = jest
      .spyOn(llm, 'streamText')
      .mockResolvedValue('A quiet star rests in the spacious night.');
  });

  afterEach(async () => {
    jest.restoreAllMocks();

    await fs.rm(directory, { recursive: true, force: true });
  });

  it('creates all artifacts, resumes without chapter one, and supplies exactly the previous tail', async () => {
    const first = Array.from(
      { length: 250 },
      (_, index) => `word-${index}`,
    ).join(' ');

    writer.mockResolvedValueOnce(first);

    await service.generateOutline(projectId);
    await service.generateChapterScript(projectId, 1);

    expect(add).not.toHaveBeenCalled();

    const restartedState = new StateManagerService(
      new ConfigService({ PROJECTS_DIR: directory }),
    );
    const restarted = new ScriptGeneratorService(
      restartedState,
      llm,
      prompts,
      queue,
    );

    await restarted.generateProjectScripts(projectId);

    expect(architect).toHaveBeenCalledTimes(1);
    expect(writer).toHaveBeenCalledTimes(2);
    expect(writer).toHaveBeenLastCalledWith(
      expect.objectContaining<Partial<LlmRequest>>({
        reasoningEffort: 'none',
      }),
    );
    expect(architect).toHaveBeenCalledWith(
      expect.objectContaining<Partial<LlmRequest>>({
        reasoningEffort: 'high',
      }),
    );

    const writerRequest = writer.mock.calls[1][0];
    const architectRequest = architect.mock.calls[0][0];

    expect(writerRequest.prompt).toContain(
      first.split(' ').slice(-200).join(' '),
    );
    expect(writerRequest.prompt).not.toContain('word-49 ');
    expect(architectRequest.system).toContain('strict JSON');

    for (const path of [
      'outline.json',
      'chapters/ch_01_raw.txt',
      'chapters/ch_02_raw.txt',
    ]) {
      expect(
        await fs.readFile(join(directory, projectId, path), 'utf8'),
      ).not.toBe('');
    }

    expect(
      (await restartedState.getState(projectId)).chapters['2'].scriptStatus,
    ).toBe('COMPLETED');
    expect(add).toHaveBeenCalledWith(
      PIPELINE_JOBS.normalizeProject,
      { projectId },
      expect.objectContaining({
        jobId: `normalize-${projectId}`,
        removeOnComplete: false,
      }),
    );
  });

  it('regenerates a completed script if its physical file was deleted', async () => {
    await service.generateProjectScripts(projectId);
    await fs.unlink(join(directory, projectId, 'chapters/ch_01_raw.txt'));
    await service.generateChapterScript(projectId, 1);

    expect(writer).toHaveBeenCalledTimes(3);
  });

  it('records failed generation and retries without repeating the outline', async () => {
    writer.mockRejectedValueOnce(new Error('Stream disconnected'));

    await expect(service.generateProjectScripts(projectId)).rejects.toThrow(
      'Stream disconnected',
    );

    expect(
      (await stateManager.getState(projectId)).chapters['1'].scriptStatus,
    ).toBe('FAILED');
    expect(add).not.toHaveBeenCalled();

    await service.generateProjectScripts(projectId);

    expect(architect).toHaveBeenCalledTimes(1);
    expect((await stateManager.getState(projectId)).error).toBeUndefined();
  });

  it('rejects invalid Architect JSON without persisting a completed outline', async () => {
    architect.mockResolvedValueOnce(
      '{"topic":"Quiet Stars","totalChapters":2,"chapters":[]}',
    );

    await expect(service.generateOutline(projectId)).rejects.toThrow(
      'Invalid Architect outline',
    );

    expect((await stateManager.getState(projectId)).outlineCompleted).toBe(
      false,
    );
    expect(writer).not.toHaveBeenCalled();
  });

  it('rejects out-of-order chapters and preserves completed scripts if handoff fails', async () => {
    await service.generateOutline(projectId);
    await expect(service.generateChapterScript(projectId, 2)).rejects.toThrow(
      'Previous chapter',
    );
    await service.generateChapterScript(projectId, 1);

    add.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(service.generateChapterScript(projectId, 2)).rejects.toThrow(
      'Redis unavailable',
    );

    expect(
      (await stateManager.getState(projectId)).chapters['2'].scriptStatus,
    ).toBe('COMPLETED');

    await service.generateChapterScript(projectId, 2);

    expect(writer).toHaveBeenCalledTimes(2);
  });
});
