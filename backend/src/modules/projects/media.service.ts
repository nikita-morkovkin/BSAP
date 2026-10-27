import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, promises as fs } from 'fs';
import { isAbsolute, relative, sep } from 'path';
import { StateManagerService } from '../state/state-manager.service';
import { ProjectsService } from './projects.service';
import type { MediaArtifact } from './types/media-artifact.type';
import { parseByteRange } from './utils/parse-byte-range.util';

@Injectable()
export class MediaService {
  constructor(
    private readonly stateManagerService: StateManagerService,
    private readonly projectsService: ProjectsService,
  ) {}

  public async streamChunk(
    projectId: string,
    chunkId: string,
    range: string | undefined,
    response: Response,
  ): Promise<StreamableFile> {
    const state = await this.projectsService.getState(projectId);
    const chunk = Object.values(state.chapters)
      .flatMap((chapter) => chapter.chunks)
      .find((candidate) => candidate.id === chunkId);

    if (!chunk || chunk.status !== 'COMPLETED') {
      throw new NotFoundException('Chunk audio not available');
    }

    const path = await this.resolveFile(projectId, chunk.filePath);
    const info = await fs.stat(path);

    response.setHeader('Accept-Ranges', 'bytes');

    if (range !== undefined) {
      const selection = parseByteRange(range, info.size);

      if (!selection) {
        response.setHeader('Content-Range', `bytes */${info.size}`);

        throw new HttpException(
          'Requested range not satisfiable',
          HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
        );
      }

      response.status(HttpStatus.PARTIAL_CONTENT);
      response.setHeader(
        'Content-Range',
        `bytes ${selection.start}-${selection.end}/${info.size}`,
      );

      return new StreamableFile(createReadStream(path, selection), {
        type: 'audio/wav',
        length: selection.end - selection.start + 1,
      });
    }

    return new StreamableFile(createReadStream(path), {
      type: 'audio/wav',
      length: info.size,
    });
  }

  public async downloadChapter(
    projectId: string,
    chapterNumber: number,
  ): Promise<StreamableFile> {
    const state = await this.projectsService.getState(projectId);
    const chapter = state.chapters[String(chapterNumber)];

    if (!chapter || chapter.ttsStatus !== 'COMPLETED') {
      throw new NotFoundException('Chapter audio not available');
    }

    const filename = `ch_${String(chapterNumber).padStart(2, '0')}.wav`;

    return this.download(
      projectId,
      chapter.audioFilePath,
      filename,
      'audio/wav',
    );
  }

  public async downloadArtifact(
    projectId: string,
    artifact: MediaArtifact,
  ): Promise<StreamableFile> {
    const state = await this.projectsService.getState(projectId);
    // Completed legacy masters already contain this assembled, unmixed source.
    const path =
      state.outputFiles[artifact] ??
      (artifact === 'narration' && state.outputFiles.wav
        ? 'output/voice_raw_full.wav'
        : undefined);
    const files = {
      narration: { filename: 'voiceover_only.wav', type: 'audio/wav' },
      backgroundMusic: {
        filename: 'background_music_only.wav',
        type: 'audio/wav',
      },
      wav: { filename: 'master_final.wav', type: 'audio/wav' },
      flac: { filename: 'master_final.flac', type: 'audio/flac' },
      timestamps: {
        filename: 'youtube_timestamps.txt',
        type: 'text/plain; charset=utf-8',
      },
      markers: {
        filename: 'timeline_markers.csv',
        type: 'text/csv; charset=utf-8',
      },
    };

    if (!path) {
      throw new NotFoundException('Project artifact not available');
    }

    return this.download(
      projectId,
      path,
      files[artifact].filename,
      files[artifact].type,
    );
  }

  private async download(
    projectId: string,
    artifactPath: string,
    filename: string,
    type: string,
  ): Promise<StreamableFile> {
    const path = await this.resolveFile(projectId, artifactPath);
    const info = await fs.stat(path);

    return new StreamableFile(createReadStream(path), {
      type,
      length: info.size,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  private async resolveFile(
    projectId: string,
    artifactPath: string,
  ): Promise<string> {
    try {
      const root = await fs.realpath(
        this.stateManagerService.getProjectDirectory(projectId),
      );
      const path = await fs.realpath(
        this.stateManagerService.getArtifactPath(projectId, artifactPath),
      );
      const within = relative(root, path);

      if (
        isAbsolute(within) ||
        within === '..' ||
        within.startsWith(`..${sep}`) ||
        !(await fs.stat(path)).isFile()
      ) {
        throw new NotFoundException('Media file not available');
      }

      return path;
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        ['ENOENT', 'ENOTDIR'].includes(String(error.code))
      ) {
        throw new NotFoundException('Media file not found');
      }

      throw error;
    }
  }
}
