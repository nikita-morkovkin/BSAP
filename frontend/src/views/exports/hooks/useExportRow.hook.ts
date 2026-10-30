import { useState, type ChangeEvent } from 'react';
import { apiClient } from '@/api/apiClient';

type ReturnProps = {
  format: string; duration: string; error: string; building: boolean;
  changeFormat: (event: ChangeEvent<HTMLSelectElement>) => void;
  changeDuration: (event: ChangeEvent<HTMLInputElement>) => void;
  build: () => Promise<void>;
};
type HookProps = { projectId: string; kind: string; formats: string[]; audioDuration?: number; refresh: () => void };

export const useExportRow = ({ projectId, kind, formats, audioDuration, refresh }: HookProps): ReturnProps => {
  const [format, setFormat] = useState(formats[0]);
  const [duration, setDuration] = useState('');
  const [error, setError] = useState('');
  const [building, setBuilding] = useState(false);
  const changeFormat = (event: ChangeEvent<HTMLSelectElement>) => { setFormat(event.target.value); };
  const changeDuration = (event: ChangeEvent<HTMLInputElement>) => { setDuration(event.target.value); };
  const build = async () => {
    setError('');
    setBuilding(true);

    try {
      if (duration && !/^\d{1,2}:[0-5]\d:[0-5]\d$/.test(duration)) {
        throw new Error('Use hh:mm:ss');
      }

      const seconds = duration ? duration.split(':').reduce((total, value) => total * 60 + Number(value), 0) : audioDuration;

      await apiClient.exports.build(projectId, kind, seconds);
      refresh();
    } catch {
      setError('Cannot start build. Check hh:mm:ss duration and whether another job is running.');
    } finally {
      setBuilding(false);
    }
  };

  return { format, duration, error, building, changeFormat, changeDuration, build };
};