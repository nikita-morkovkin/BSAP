import { ConfigService } from '@nestjs/config';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PolzaLlmService } from './polza-llm.service';
import type { ReasoningEffort } from './types/reasoning-effort.type';
import { parseOutline } from './utils/parse-outline.util';

describe('PolzaLlmService with the real AI SDK and a local HTTP gateway', () => {
  let server: Server;
  let service: PolzaLlmService;
  let requests: Record<string, unknown>[];
  let finishReason: string;
  let expectedAuthorization: string;
  let failOnce: boolean;

  beforeEach(async () => {
    requests = [];
    finishReason = 'stop';
    expectedAuthorization = 'Bearer test-key';
    failOnce = false;
    server = createServer((request, response) => {
      let body = '';

      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        body += chunk;
      });
      request.on('end', () => {
        const payload = JSON.parse(body) as Record<string, unknown>;

        requests.push(payload);
        expect(request.url).toBe('/v1/chat/completions');
        expect(request.headers.authorization).toBe(expectedAuthorization);

        if (failOnce) {
          failOnce = false;
          response.writeHead(429, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ error: { message: 'Rate limited' } }));

          return;
        }

        if (payload.stream) {
          response.writeHead(200, { 'Content-Type': 'text/event-stream' });

          for (const content of ['Soft ', 'starlight.']) {
            response.write(
              `data: ${JSON.stringify({
                id: 'test',
                object: 'chat.completion.chunk',
                created: 1,
                model: 'writer',
                choices: [
                  { index: 0, delta: { content }, finish_reason: null },
                ],
              })}\n\n`,
            );
          }

          response.end(
            `data: ${JSON.stringify({
              id: 'test',
              object: 'chat.completion.chunk',
              created: 1,
              model: 'writer',
              choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
            })}\n\ndata: [DONE]\n\n`,
          );

          return;
        }

        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'test',
            object: 'chat.completion',
            created: 1,
            model: 'architect',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: JSON.stringify({
                    topic: 'Stars',
                    totalChapters: 1,
                    chapters: [
                      {
                        chapterNumber: 1,
                        title: 'Light',
                        keyScientificFacts: ['Stars emit light.'],
                        sensoryThemes: ['Soft light'],
                        targetWordCount: 900,
                      },
                    ],
                  }),
                },
                finish_reason: finishReason,
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
      });
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );

    const address = server.address() as AddressInfo;

    service = new PolzaLlmService(
      new ConfigService({
        POLZA_API_URL: `http://127.0.0.1:${address.port}/v1`,
        POLZA_API_KEY: 'test-key',
      }),
    );
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      server.closeAllConnections();
    });
  });

  it.each<ReasoningEffort>(['none', 'low', 'medium', 'high'])(
    'serializes %s reasoning effort and validates the generated JSON outline',
    async (reasoningEffort) => {
      const text = await service.generateText({
        model: 'architect',
        system: 'Outline.',
        prompt: 'Stars',
        reasoningEffort,
        temperature: 0.7,
      });

      expect(requests[0]).toMatchObject({
        model: 'architect',
        reasoning_effort: reasoningEffort,
      });
      expect(parseOutline(text).chapters[0].title).toBe('Light');
    },
  );

  it('accumulates SSE text and sends no reasoning for the writer', async () => {
    const text = await service.streamText({
      model: 'writer',
      system: 'Narrate.',
      prompt: 'Stars',
      reasoningEffort: 'none',
      temperature: 0.7,
    });

    expect(text).toBe('Soft starlight.');
    expect(requests[0]).toMatchObject({
      stream: true,
      reasoning_effort: 'none',
    });
  });

  it('rejects truncated streams instead of accepting partial chapters', async () => {
    finishReason = 'length';

    await expect(
      service.streamText({
        model: 'writer',
        system: 'Narrate.',
        prompt: 'Stars',
        reasoningEffort: 'none',
        temperature: 0.7,
      }),
    ).rejects.toThrow('Incomplete Polza response');
  });

  it('automatically retries a transient gateway error', async () => {
    failOnce = true;

    await service.generateText({
      model: 'architect',
      system: 'Outline.',
      prompt: 'Stars',
      reasoningEffort: 'high',
      temperature: 0.7,
    });

    expect(requests).toHaveLength(2);
  });

  it('requires a non-empty API key', () => {
    expect(
      () =>
        new PolzaLlmService(
          new ConfigService({
            POLZA_API_URL: 'http://127.0.0.1/v1',
            POLZA_API_KEY: '   ',
          }),
        ),
    ).toThrow('POLZA_API_KEY must not be empty');
  });

  it('extracts fenced JSON but rejects schema-invalid outlines', () => {
    expect(() =>
      parseOutline(
        '```json\n{"topic":"Stars","totalChapters":2,"chapters":[]}\n```',
      ),
    ).toThrow('Invalid Architect outline');
    expect(() => parseOutline('No JSON')).toThrow('does not contain');
  });
});
