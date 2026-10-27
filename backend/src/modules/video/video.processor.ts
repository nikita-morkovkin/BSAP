import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { promises as fs } from 'fs';
import { relative } from 'path';
import { FfmpegService } from '../audio/ffmpeg.service';
import { StateManagerService } from '../state/state-manager.service';
import { videoProbeSchema } from './schemas';
import type { VideoTask } from './types/video-task.type';
import type { VideoJobState } from './types/video-job.type';
import type { NormalizedClip } from './types/normalized-clip.type';
import { VideoLibraryService } from './video-library.service';
import { VideoNormalizerService } from './video-normalizer.service';
import { VideoPlannerService } from './video-planner.service';
import { VideoChunkRendererService } from './video-chunk-renderer.service';
import { VideoFinalMuxService } from './video-final-mux.service';
import { VideoJobService } from './video-job.service';

@Processor('video', { concurrency: 1 })
export class VideoProcessor extends WorkerHost {
  constructor(
    private readonly state: StateManagerService,
    private readonly library: VideoLibraryService,
    private readonly normalizer: VideoNormalizerService,
    private readonly planner: VideoPlannerService,
    private readonly renderer: VideoChunkRendererService,
    private readonly muxer: VideoFinalMuxService,
    private readonly ffmpeg: FfmpegService,
    private readonly jobs: VideoJobService,
  ) {
    super();
  }

  public async process(job: Job<VideoTask>): Promise<void> {
    const task = job.data;
    const { projectId, jobId, kind } = task;
    const signal = this.jobs.attach(jobId);
    let updates = Promise.resolve();
    let lastUpdate = 0;
    const report = (stage: VideoJobState['stage'], value: number) => {
      if (Date.now() - lastUpdate < 500 && value !== 1) {
        return;
      }

      lastUpdate = Date.now();

      const weights = {
        normalizing: [0, 0.3],
        planning: [0.3, 0],
        rendering_chunks: [0.3, 0.55],
        stitching: [0.85, 0.05],
        muxing: [0.9, 0.1],
      };
      const [base, weight] = weights[stage as keyof typeof weights] ?? [0, 0];

      updates = updates
        .then(() =>
          this.jobs.update(projectId, jobId, {
            stage,
            stageProgress: value,
            progress: base + value * weight,
          }),
        )
        .catch(() => undefined);
    };

    try {
      const saved = await this.jobs.get(projectId, jobId);

      if (saved.stage !== 'queued') {
        return;
      }

      if (kind !== 'mux') {
        const style =
          kind === 'preview'
            ? {
                ...task.style,
                width: 640,
                height: 360,
                cycleTargetMinutes: 0.5,
              }
            : task.style;
        let clips = (await this.library.list(projectId)).filter(
          (clip) => clip.enabled && clip.status === 'ready',
        );

        if (kind === 'preview') {
          clips = clips.sort((a, b) => a.id.localeCompare(b.id));

          const offset = style.seed % Math.max(1, clips.length);

          clips = [...clips.slice(offset), ...clips.slice(0, offset)].slice(
            0,
            3,
          );
        }

        if (!clips.length) {
          throw new Error('Upload and enable at least one clip');
        }

        const disk = await fs.statfs(this.state.getProjectDirectory(projectId));
        const estimate =
          clips.reduce(
            (sum, clip) => sum + clip.durationSec * style.slowMoMax * 1200000,
            0,
          ) +
          style.cycleTargetMinutes * 60 * 3000000;

        if (disk.bavail * disk.bsize < estimate) {
          throw new Error(
            `Insufficient free disk space. Estimated video cache: ${Math.ceil(estimate / 1073741824)} GiB`,
          );
        }

        const normalized: NormalizedClip[] = [];

        report('normalizing', 0);

        for (const [index, clip] of clips.entries()) {
          normalized.push(
            await this.normalizer.normalize(
              projectId,
              clip,
              style,
              signal,
              kind === 'preview',
            ),
          );

          report('normalizing', (index + 1) / clips.length);
        }

        signal.throwIfAborted();

        report('planning', 1);

        const audio =
          kind === 'preview'
            ? null
            : await this.ffmpeg.getFinalAudioInfo(projectId);
        const plan = this.planner.plan(
          normalized,
          style,
          kind === 'preview' ? 30 : audio?.duration,
        );
        const cyclePath = await this.renderer.render(
          projectId,
          plan,
          style,
          signal,
          report,
          kind === 'preview',
        );
        const path = relative(
          this.state.getProjectDirectory(projectId),
          cyclePath,
        ).replace(/\\/g, '/');
        const probe = videoProbeSchema.parse(
          await this.ffmpeg.probeMedia(cyclePath),
        );

        signal.throwIfAborted();

        await this.state.updateState(projectId, (current) => {
          if (
            current.video &&
            current.video.job?.jobId === jobId &&
            current.video.job.stage !== 'cancelled'
          ) {
            if (kind === 'preview') {
              current.video.preview = path;
            } else {
              if (current.video.cycle?.planHash !== plan.planHash) {
                delete current.video.output;
              }

              current.video.cycle = {
                path,
                planHash: plan.planHash,
                duration: Number(probe.format.duration),
                loop: Boolean(plan.loopWindow),
                fps: style.fps,
              };
            }
          }
        });

        if (kind === 'preview') {
          await updates;
          await this.jobs.update(projectId, jobId, {
            stage: 'done',
            progress: 1,
            stageProgress: 1,
            outputPath: path,
          });

          return;
        }
      }

      signal.throwIfAborted();

      report('muxing', 0);

      const output = await this.muxer.mux(projectId, signal, (value) =>
        report('muxing', value),
      );

      if (kind === 'mux' && !output) {
        throw new Error(
          'A video cycle and final audio are both required for muxing',
        );
      }

      const current = await this.state.getState(projectId);

      await updates;
      await this.jobs.update(projectId, jobId, {
        stage: 'done',
        progress: 1,
        stageProgress: 1,
        outputPath: output ?? current.video?.cycle?.path,
        message: output
          ? 'Final video ready'
          : 'Video cycle ready. Generate audio, then mux.',
      });
    } catch (error) {
      await updates;

      if (!signal.aborted) {
        await this.jobs.update(projectId, jobId, {
          stage: 'failed',
          error:
            error instanceof Error
              ? error.message.slice(-8000)
              : 'Video job failed',
        });
      }
    } finally {
      this.jobs.detach(jobId);
    }
  }
}
