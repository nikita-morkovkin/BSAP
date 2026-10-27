import { Injectable } from '@nestjs/common';
import { StateManagerService } from '../state/state-manager.service';
import { VideoLibraryService } from './video-library.service';
import { videoHash } from './utils';

@Injectable()
export class VideoInputsService {
  constructor(
    private readonly state: StateManagerService,
    private readonly library: VideoLibraryService,
  ) {}

  public async cycle(projectId: string): Promise<string> {
    const video = (await this.state.getState(projectId)).video;
    const clips = (await this.library.list(projectId))
      .filter((clip) => clip.enabled)
      .map((clip) => clip.sha256)
      .sort();

    return videoHash({
      style: video?.style,
      clips,
      effects: video?.effects,
      rules: video?.effectRules,
      assignments: video?.effectAssignments,
    });
  }

  public async greeting(projectId: string): Promise<string> {
    const video = (await this.state.getState(projectId)).video;
    const clips = (await this.library.list(projectId, 'character'))
      .map((clip) => ({ hash: clip.sha256, role: clip.role }))
      .sort((a, b) => a.hash.localeCompare(b.hash));

    return videoHash({
      config: video?.greeting,
      audio: video?.greetingAudio,
      external:
        video?.greeting?.lipSyncMode === 'external_lipsync'
          ? video.externalGreeting
          : undefined,
      style: video?.style,
      clips,
    });
  }
}
