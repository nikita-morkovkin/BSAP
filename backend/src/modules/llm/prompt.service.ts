import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { basename, join, resolve } from 'path';
import { PromptRole } from './types';

@Injectable()
export class PromptService {
  constructor(private readonly configService: ConfigService) {}

  public async getSystemPrompt(
    role: PromptRole,
    instructions: string,
  ): Promise<string> {
    const prompt = await this.getDefaultSystemPrompt(role);

    if (instructions.trim() === prompt.trim()) {
      return prompt.trim();
    }

    return `${prompt.trim()}\n\nAdditional project instructions:\n${instructions}`;
  }

  public async getDefaultSystemPrompt(role: PromptRole): Promise<string> {
    const workingDirectory = process.cwd();

    const defaultDirectory =
      basename(workingDirectory) === 'backend'
        ? resolve(workingDirectory, '..', 'prompts')
        : join(workingDirectory, 'prompts');

    const directory =
      this.configService.get<string>('PROMPTS_DIR') ?? defaultDirectory;

    const prompt = await fs.readFile(
      join(directory, `${role}.system.md`),
      'utf8',
    );

    return prompt;
  }
}
