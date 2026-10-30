import { apiClient } from "@/api/apiClient";
import { useProject } from "@/hooks/queries/useProject.hook";
import { sortedChapters } from "@/utils/project.util";

type UseDownloadsPanelHookProps = { projectId: string };

export const useDownloadsPanel = ({
  projectId,
}: UseDownloadsPanelHookProps) => {
  const query = useProject({ id: projectId });

  const handleRetry = () => {
    query.refetch();
  };

  const state = query.data?.state;

  const data = state
    ? {
        state,
        projectTitle: state.title ?? state.topic,
        chapters: sortedChapters(state.chapters),
        flacUrl: apiClient.media.downloadMediaUrl(projectId, "flac"),
        wavUrl: apiClient.media.downloadMediaUrl(projectId, "wav"),
        narrationUrl: apiClient.media.downloadMediaUrl(projectId, "narration"),
        backgroundMusicUrl: apiClient.media.downloadMediaUrl(
          projectId,
          "backgroundMusic",
        ),
        timestampsUrl: apiClient.media.downloadMediaUrl(
          projectId,
          "timestamps",
        ),
        markersUrl: apiClient.media.downloadMediaUrl(projectId, "markers"),
        hasNarration: Boolean(
          state.outputFiles.narration || state.outputFiles.wav,
        ),
        hasFlac: Boolean(state.outputFiles.flac),
        hasWav: Boolean(state.outputFiles.wav),
        hasTimestamps: Boolean(state.outputFiles.timestamps),
        hasMarkers: Boolean(state.outputFiles.markers),
        hasBackgroundMusic: Boolean(state.outputFiles.backgroundMusic),
      }
    : undefined;

  return { query, handleRetry, data };
};
