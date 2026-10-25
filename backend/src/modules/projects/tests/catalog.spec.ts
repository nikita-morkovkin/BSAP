import { ConfigService } from '@nestjs/config';
import { CatalogService } from '../catalog.service';

describe('Provider settings catalogs', () => {
  const config = new ConfigService({
    POLZA_API_URL: 'http://polza/v1/',
    POLZA_API_KEY: 'test-key',
    KOKORO_TTS_URL: 'http://kokoro/',
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns chat models with model-level and provider-level reasoning metadata', async () => {
    const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue(
      Response.json({
        data: [
          {
            id: 'model-a',
            name: 'Model A',
            type: 'chat',
            reasoning: {
              mandatory: true,
              supported_efforts: ['max', 'high'],
              default_effort: 'max',
            },
          },
          {
            id: 'model-b',
            type: 'chat',
            top_provider: {
              supported_parameters: ['reasoning_effort'],
              reasoning: { supported_efforts: ['none', 'low'] },
            },
          },
          { id: 'image', type: 'image' },
          { id: 'plain', type: 'chat' },
        ],
      }),
    );
    const models = await new CatalogService(config).getModels();
    expect(fetcher).toHaveBeenCalledWith(
      'http://polza/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
      }),
    );
    expect(models).toHaveLength(3);
    expect(models[0].reasoning).toMatchObject({
      mandatory: true,
      supportedEfforts: ['max', 'high'],
      defaultEffort: 'max',
    });
    expect(models[1].reasoning.supportedEfforts).toEqual(['none', 'low']);
    expect(models[2].reasoning.supportedEfforts).toEqual([]);
  });

  it.each([
    { voices: ['bm_george', 'bm_lewis'] },
    { voices: [{ id: 'bm_george', name: 'George' }, { id: 'bm_lewis' }] },
  ])(
    'supports legacy and current Kokoro voice catalog shapes',
    async (payload) => {
      jest.spyOn(global, 'fetch').mockResolvedValue(Response.json(payload));
      const voices = await new CatalogService(config).getVoices();
      expect(voices.map((voice) => voice.id)).toEqual([
        'bm_george',
        'bm_lewis',
      ]);
    },
  );

  it('reports upstream outages as service unavailable', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('down', { status: 503 }));
    await expect(new CatalogService(config).getVoices()).rejects.toMatchObject({
      status: 503,
    });
  });
});
