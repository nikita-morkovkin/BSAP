import { createOpenAI } from '@ai-sdk/openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateText, streamText } from 'ai';
import type { LlmRequest } from './types/llm-request.type';

@Injectable()
export class PolzaLlmService {
  private readonly llmBaseUrl: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.getOrThrow<string>('POLZA_API_KEY');

    if (!this.apiKey.trim()) {
      throw new Error('POLZA_API_KEY must not be empty');
    }

    this.llmBaseUrl = this.configService.getOrThrow<string>('POLZA_API_URL');
  }

  public async generateText(request: LlmRequest): Promise<string> {
    const options = this.getOptions(request);
    const result = await generateText(options);

    this.validateCompletion(result.text, result.finishReason);

    return result.text;
  }

  public async streamText(request: LlmRequest): Promise<string> {
    const options = this.getOptions(request);
    const result = streamText(options);
    let text = '';

    for await (const part of result.stream) {
      if (part.type === 'error') {
        throw part.error instanceof Error
          ? part.error
          : new Error('Polza text stream failed');
      }

      if (part.type === 'abort') {
        throw new Error('Polza text stream was aborted');
      }

      if (part.type === 'text-delta') {
        text += part.text;
      }
    }

    this.validateCompletion(text, await result.finishReason);

    return text;
  }

  private getOptions(request: LlmRequest) {
    const provider = createOpenAI({
      baseURL: this.llmBaseUrl,
      apiKey: this.apiKey,
    });

    return {
      model: provider.chat(request.model),
      system: request.system,
      prompt: request.prompt,
      temperature: request.temperature,
      maxRetries: 5,
      providerOptions: {
        openai: { reasoningEffort: request.reasoningEffort },
      },
    };
  }

  private validateCompletion(text: string, finishReason: string): void {
    if (!text.trim() || finishReason !== 'stop') {
      throw new Error(
        `Incomplete Polza response (finish reason: ${finishReason})`,
      );
    }
  }
}
