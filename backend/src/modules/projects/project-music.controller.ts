import {
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { existsSync } from 'fs';
import { ZodValidationPipe } from '../../pipes/zod-validation.pipe';
import { MasterProjectQueueService } from '../audio/master-project-queue.service';
import { UpdateProjectMusicDto } from '../music/dto/update-project-music.dto';
import { ProjectMusicService } from '../music/project-music.service';
import { stateSchema } from '../state/schemas';
import { StateManagerService } from '../state/state-manager.service';

@Controller('api/projects')
export class ProjectMusicController {
  constructor(
    private readonly music: ProjectMusicService,
    private readonly manager: StateManagerService,
    private readonly queue: MasterProjectQueueService,
  ) {}

  @Put(':id/music')
  public async update(
    @Param('id', new ZodValidationPipe(stateSchema.shape.projectId)) id: string,
    @Body() payload: UpdateProjectMusicDto,
  ) {
    return this.music.update(id, payload);
  }

  @Post(':id/remaster')
  @HttpCode(202)
  public async remaster(
    @Param('id', new ZodValidationPipe(stateSchema.shape.projectId)) id: string,
  ) {
    return this.music.idle(id, async () => {
      const state = await this.music.initialize(id);
      const chapters = Object.values(state.chapters);

      if (
        !chapters.length ||
        chapters.some(
          (chapter) =>
            chapter.ttsStatus !== 'COMPLETED' ||
            !existsSync(
              this.manager.getArtifactPath(id, chapter.audioFilePath),
            ),
        )
      ) {
        throw new ConflictException(
          'Rebuild requires existing assembled narration. Resume production first.',
        );
      }

      await this.music.paths(id);
      await this.queue.enqueueProject(id);

      return this.manager.updateState(id, (current) => {
        current.status = 'MASTERING';

        delete current.error;
      });
    });
  }
}
