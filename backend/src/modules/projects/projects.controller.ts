import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../pipes/zod-validation.pipe';
import { stateSchema } from '../state/schemas';
import { CreateProjectDto } from './dto/create-project.dto';
import { RegenerateChunkDto } from './dto/regenerate-chunk.dto';
import { ProjectsService } from './projects.service';

@Controller('api/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  public async listProjects() {
    return this.projectsService.listProjects();
  }

  @Get('defaults')
  public async getDefaults() {
    return this.projectsService.getDefaults();
  }

  @Post()
  public async createProject(@Body() payload: CreateProjectDto) {
    return this.projectsService.createProject(payload);
  }

  @Get(':id')
  public async getProject(
    @Param('id', new ZodValidationPipe(stateSchema.shape.projectId))
    projectId: string,
  ) {
    return this.projectsService.getProject(projectId);
  }

  @Post(':id/resume')
  @HttpCode(202)
  public async resume(
    @Param('id', new ZodValidationPipe(stateSchema.shape.projectId))
    projectId: string,
  ) {
    return this.projectsService.resume(projectId);
  }

  @Post(':id/cancel-outline')
  @HttpCode(202)
  public async cancelOutline(
    @Param('id', new ZodValidationPipe(stateSchema.shape.projectId))
    projectId: string,
  ) {
    return this.projectsService.cancelOutline(projectId);
  }

  @Delete(':id')
  @HttpCode(204)
  public async deleteProject(
    @Param('id', new ZodValidationPipe(stateSchema.shape.projectId))
    projectId: string,
  ) {
    await this.projectsService.deleteProject(projectId);
  }

  @Post(':id/chapters/:chapterNumber/chunks/:chunkId/regenerate')
  @HttpCode(202)
  public async regenerateChunk(
    @Param('id', new ZodValidationPipe(stateSchema.shape.projectId))
    projectId: string,
    @Param(
      'chapterNumber',
      new ZodValidationPipe(z.coerce.number().int().positive().safe()),
    )
    chapterNumber: number,
    @Param('chunkId', new ZodValidationPipe(z.string().min(1))) chunkId: string,
    @Body() overrides: RegenerateChunkDto,
  ) {
    return this.projectsService.regenerateChunk(
      projectId,
      chapterNumber,
      chunkId,
      overrides,
    );
  }
}
