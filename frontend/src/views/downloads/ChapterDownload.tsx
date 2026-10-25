import { apiClient } from '@/api/apiClient';
import type { Chapter } from '@/types/project.types';
import DownloadLink from './DownloadLink';

type ChapterDownloadProps = { projectId: string; chapter: Chapter };

const ChapterDownload = ({ projectId, chapter }: ChapterDownloadProps) => {
  const url = apiClient.media.downloadChapterUrl(projectId, chapter.chapterNumber);
  const available = chapter.ttsStatus === 'COMPLETED';
  const label = `Chapter ${chapter.chapterNumber} · WAV`;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
      <span className="text-sm">{chapter.title}</span>
      <DownloadLink url={url} label={label} available={available} />
    </li>
  );
};

export default ChapterDownload;