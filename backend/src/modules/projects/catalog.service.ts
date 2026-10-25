import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

const reasoningSchema = z.object({
  mandatory: z.boolean().optional(),
  default_enabled: z.boolean().optional(),
  supported_efforts: z.array(z.string()).nullable().optional(),
  default_effort: z.string().nullable().optional(),
});
const providerSchema = z.object({
  reasoning: reasoningSchema.nullable().optional(),
  supported_parameters: z.array(z.string()).nullable().optional(),
});
const modelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().optional(),
      type: z.string().optional(),
      reasoning: reasoningSchema.nullable().optional(),
      supported_parameters: z.array(z.string()).nullable().optional(),
      top_provider: providerSchema.nullable().optional(),
    }),
  ),
});
const voicesSchema = z.object({
  voices: z
    .array(
      z.union([
        z.string().min(1),
        z.object({
          id: z.string().min(1),
          name: z.string().optional(),
        }),
      ]),
    )
    .min(1),
});

@Injectable()
export class CatalogService {
  constructor(private readonly config: ConfigService) {}

  public async getModels() {
    const result = modelsSchema.safeParse(
      await this.getJson(
        `${this.config.getOrThrow<string>('POLZA_API_URL').replace(/\/+$/, '')}/models`,
        {
          Authorization: `Bearer ${this.config.getOrThrow<string>('POLZA_API_KEY')}`,
        },
      ),
    );
    if (!result.success)
      throw new ServiceUnavailableException(
        'Invalid Polza model catalog. Please retry.',
      );
    const payload = result.data;

    return payload.data
      .filter((model) => !model.type || model.type === 'chat')
      .map((model) => {
        const reasoning = model.reasoning ?? model.top_provider?.reasoning;
        return {
          id: model.id,
          name: model.name ?? model.id,
          supportedParameters:
            model.supported_parameters ??
            model.top_provider?.supported_parameters ??
            [],
          reasoning: {
            mandatory: reasoning?.mandatory ?? false,
            defaultEnabled: reasoning?.default_enabled ?? false,
            supportedEfforts: reasoning?.supported_efforts ?? [],
            defaultEffort: reasoning?.default_effort ?? null,
          },
        };
      });
  }

  public async getVoices() {
    const result = voicesSchema.safeParse(
      await this.getJson(
        `${this.config.getOrThrow<string>('KOKORO_TTS_URL').replace(/\/+$/, '')}/v1/audio/voices`,
      ),
    );
    if (!result.success)
      throw new ServiceUnavailableException(
        'Invalid Kokoro voice catalog. Please retry.',
      );
    const payload = result.data;
    return payload.voices.map((voice) =>
      typeof voice === 'string'
        ? { id: voice, name: voice }
        : { id: voice.id, name: voice.name ?? voice.id },
    );
  }

  private async getJson(
    url: string,
    headers?: Record<string, string>,
  ): Promise<unknown> {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch {
      throw new ServiceUnavailableException(
        'Provider catalog unavailable. Please retry.',
      );
    }
  }
}
