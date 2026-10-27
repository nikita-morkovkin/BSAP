import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import { basename, extname } from 'path';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import { writeArtifact } from '../../utils/write-artifact.util';
import { videoProbeSchema, videoStyleSchema } from './schemas';
import type { StockClipMeta } from './types/stock-clip.type';
import type { VideoUpload } from './types/video-upload.type';
import { clipTiming } from './utils';

@Injectable()
export class VideoLibraryService {
  constructor(
    private readonly state: StateManagerService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  public async list(projectId: string): Promise<StockClipMeta[]> {
    const state = await this.state.getState(projectId);
    const root = this.path(projectId, 'library');
    const style = state.video?.style ?? videoStyleSchema.parse({});

    await fs.mkdir(root, { recursive: true });

    const entries = await fs.readdir(root, { withFileTypes: true });
    const clips: StockClipMeta[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && /^[a-f0-9]{16}$/.test(entry.name)) {
        const clip = await this.get(projectId, entry.name);

        clips.push({
          ...clip,
          plannedDurationSec: clipTiming(clip.durationSec, style).duration,
        });
      }
    }

    return clips;
  }

  public async get(projectId: string, clipId: string): Promise<StockClipMeta> {
    if (!/^[a-f0-9]{16}$/.test(clipId)) {
      throw new BadRequestException('Invalid clip ID');
    }

    try {
      return JSON.parse(
        await fs.readFile(
          this.path(projectId, `library/${clipId}/meta.json`),
          'utf8',
        ),
      ) as StockClipMeta;
    } catch {
      throw new NotFoundException('Clip not found');
    }
  }

  public async upload(
    projectId: string,
    file: VideoUpload,
  ): Promise<StockClipMeta> {
    await this.state.getState(projectId);

    const extension = extname(file.originalname).toLowerCase();

    if (!['.mp4', '.mov', '.mkv', '.webm', '.m4v'].includes(extension)) {
      throw new BadRequestException('Unsupported video extension');
    }

    const hash = createHash('sha256');

    for await (const data of createReadStream(file.path)) {
      if (!Buffer.isBuffer(data)) {
        throw new Error('Unexpected upload stream data');
      }

      hash.update(data);
    }

    const sha256 = hash.digest('hex');
    const id = sha256.slice(0, 16);
    const existing = await this.get(projectId, id).catch(() => null);

    if (existing) {
      return existing;
    }

    const probe = videoProbeSchema.parse(
      await this.ffmpeg.probeMedia(file.path),
    );
    const stream = probe.streams.find((item) => item.codec_type === 'video');
    const duration = Number(stream?.duration ?? probe.format.duration);

    if (
      !stream ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !stream.width ||
      !stream.height ||
      Math.max(stream.width, stream.height) > 8192
    ) {
      throw new BadRequestException(
        'Clip must have a positive-duration video stream at no more than 8K resolution',
      );
    }

    const rate = (value?: string) => {
      const [numerator, denominator] = (value ?? '0/1').split('/').map(Number);

      return numerator / (denominator || 1);
    };
    const relative = `video/library/${id}`;
    const clip: StockClipMeta = {
      id,
      sha256,
      originalName: basename(file.originalname).slice(0, 200),
      filePath: `${relative}/original${extension}`,
      thumbPath: `${relative}/thumb.jpg`,
      durationSec: duration,
      fps: rate(stream.avg_frame_rate) || rate(stream.r_frame_rate),
      width: stream.width,
      height: stream.height,
      codec: stream.codec_name ?? 'unknown',
      sizeBytes: file.size,
      hasVideoStream: true,
      status: 'ready',
      enabled: true,
      vfr:
        Math.abs(rate(stream.avg_frame_rate) - rate(stream.r_frame_rate)) >
        0.01,
      normalizedDurations: {},
    };

    await fs.mkdir(this.path(projectId, `library/${id}`), { recursive: true });

    try {
      await fs.copyFile(
        file.path,
        this.state.getArtifactPath(projectId, clip.filePath),
      );
      await this.ffmpeg.renderMedia(
        this.state.getArtifactPath(projectId, clip.thumbPath),
        [
          '-ss',
          String(Math.min(2, duration / 2)),
          '-i',
          file.path,
          '-vf',
          'scale=320:-2',
          '-frames:v',
          '1',
        ],
      );
      await this.save(projectId, clip);
    } catch (error) {
      await fs.rm(this.path(projectId, `library/${id}`), {
        recursive: true,
        force: true,
      });

      throw error;
    }

    return clip;
  }

  public async save(projectId: string, clip: StockClipMeta): Promise<void> {
    await writeArtifact(
      this.path(projectId, `library/${clip.id}/meta.json`),
      JSON.stringify(clip, null, 2),
    );
  }

  public async toggle(projectId: string, id: string, enabled: boolean) {
    await this.assertIdle(projectId);

    const clip = await this.get(projectId, id);

    clip.enabled = enabled;

    await this.save(projectId, clip);

    return clip;
  }

  public async delete(projectId: string, id: string): Promise<void> {
    await this.assertIdle(projectId);
    await this.get(projectId, id);
    await fs.rm(this.path(projectId, `library/${id}`), {
      recursive: true,
      force: true,
    });
    await this.clearCache(projectId);
  }

  public async clearCache(projectId: string): Promise<void> {
    await this.assertIdle(projectId);

    for (const directory of [
      'normalized',
      'chunks',
      'cycle',
      'preview',
      'final',
    ]) {
      await fs.rm(this.path(projectId, directory), {
        recursive: true,
        force: true,
      });
    }

    await this.state.updateState(projectId, (state) => {
      if (state.video) {
        delete state.video.cycle;
        delete state.video.output;
        delete state.video.preview;
      }
    });
  }

  public path(projectId: string, suffix: string): string {
    return this.state.getArtifactPath(projectId, `video/${suffix}`);
  }

  private async assertIdle(projectId: string): Promise<void> {
    const state = await this.state.getState(projectId);

    if (
      state.video?.job &&
      !['done', 'failed', 'cancelled'].includes(state.video.job.stage)
    ) {
      throw new ConflictException(
        'Wait for the video job to finish or cancel it first',
      );
    }
  }
}
