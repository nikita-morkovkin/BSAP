import { createProjectSchema } from './create-project.schema';

describe('createProjectSchema', () => {
  const profile = {
    architectModel: 'architect',
    writerModel: 'writer',
    architectReasoningEffort: 'high',
    writerReasoningEffort: 'none',
    temperature: 0.7,
    architectSystemPrompt: 'Outline the documentary.',
    writerSystemPrompt: 'Write the narration.',
    ttsVoice: 'bm_george',
    ttsSpeed: 0.85,
    masteringConfig: {},
  };

  const payload = {
    title: 'The Ocean',
    description: 'A gentle journey beneath the waves.',
    profile,
  };

  it('requires and trims separate title and description values', () => {
    expect(
      createProjectSchema.parse({
        ...payload,
        title: '  The Ocean  ',
        description: '  A gentle journey beneath the waves.  ',
      }),
    ).toMatchObject({
      title: 'The Ocean',
      description: 'A gentle journey beneath the waves.',
    });
    expect(
      createProjectSchema.safeParse({ ...payload, title: '  ' }).success,
    ).toBe(false);
    expect(
      createProjectSchema.safeParse({ ...payload, description: ' \n ' })
        .success,
    ).toBe(false);
    expect(
      createProjectSchema.safeParse({ ...payload, title: 'T'.repeat(101) })
        .success,
    ).toBe(false);
    expect(
      createProjectSchema.safeParse({
        ...payload,
        description: 'D'.repeat(2001),
      }).success,
    ).toBe(false);
  });
});
