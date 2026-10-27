import { useRef } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import Button from '@/components/ui/Button';
import { videoText } from './consts/video-text.const';
import { collectDroppedFiles } from './utils/collect-dropped-files.util';

type ClipDropzoneProps = { onFiles: (files: File[]) => void };

const ClipDropzone = ({ onFiles }: ClipDropzoneProps) => {
  const folder = useRef<HTMLInputElement>(null);
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onFiles(Array.from(event.target.files ?? []));

    event.target.value = '';
  };
  const handleDrag = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); };
  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const files = await collectDroppedFiles(event.dataTransfer);

    onFiles(files);
  };
  const chooseFolder = () => { folder.current?.click(); };
  const directoryProps = { webkitdirectory: '' };

  return (
    <div className="space-y-3 rounded-xl border border-dashed p-5" onDragOver={handleDrag} onDrop={handleDrop}>
      <p>{videoText.drop}</p>
      <label className="block text-sm">{videoText.files}
        <input className="block max-w-full" type="file" multiple accept=".mp4,.mov,.mkv,.webm,.m4v" onChange={handleChange} />
      </label>
      <input ref={folder} type="file" multiple hidden {...directoryProps} onChange={handleChange} />
      <Button variant="outline" onClick={chooseFolder}>{videoText.folder}</Button>
    </div>
  );
};

export default ClipDropzone;