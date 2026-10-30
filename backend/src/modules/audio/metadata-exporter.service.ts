import { Injectable } from '@nestjs/common';
import { writeArtifact } from '../../utils/write-artifact.util';
import { StateManagerService } from '../state/state-manager.service';

@Injectable()
export class MetadataExporterService {
  constructor(private readonly stateManagerService: StateManagerService) {}

  public async export(projectId: string): Promise<void> {
    const state = await this.stateManagerService.getState(projectId);
    const chapters = Object.values(state.chapters).sort(
      (left, right) => left.chapterNumber - right.chapterNumber,
    );
    const timestamps: string[] = [];
    const markers = ['#,Timecode In,Timecode Out,Name,Comment,Color'];
    let elapsedMs = 0;

    if (
      chapters.length === 0 ||
      chapters.some((chapter) => chapter.durationMs <= 0)
    ) {
      throw new Error('Chapter durations are required to export metadata');
    }

    for (const chapter of chapters) {
      const title = chapter.title.replace(/[\r\n]+/g, ' ');

      timestamps.push(`${this.timestamp(elapsedMs)} - ${title}`);
      markers.push(
        [
          String(chapter.chapterNumber),
          this.timecode(elapsedMs),
          this.timecode(elapsedMs + chapter.durationMs),
          title,
          '',
          'Blue',
        ]
          .map((value) => `"${value.replace(/"/g, '""')}"`)
          .join(','),
      );

      elapsedMs += chapter.durationMs;
    }

    await writeArtifact(
      this.stateManagerService.getArtifactPath(
        projectId,
        'output/youtube_timestamps.txt',
      ),
      `${timestamps.join('\n')}\n`,
    );
    await writeArtifact(
      this.stateManagerService.getArtifactPath(
        projectId,
        'output/timeline_markers.csv',
      ),
      `${markers.join('\n')}\n`,
    );
  }

  private timestamp(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);

    return [
      Math.floor(seconds / 3600),
      Math.floor(seconds / 60) % 60,
      seconds % 60,
    ]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');
  }

  // NLE timecodes use a documented 30 fps non-drop-frame timeline.
  private timecode(milliseconds: number): string {
    const frames = Math.round((milliseconds * 30) / 1000);

    return `${this.timestamp(Math.floor(frames / 30) * 1000)}:${String(frames % 30).padStart(2, '0')}`;
  }
}
