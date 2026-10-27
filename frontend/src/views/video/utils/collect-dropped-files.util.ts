export const collectDroppedFiles = async (transfer: DataTransfer): Promise<File[]> => {
  const entries = Array.from(transfer.items).map((item) => item.webkitGetAsEntry());
  const files: File[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));

      files.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();

      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));

        if (!batch.length) {
          break;
        }

        for (const child of batch) {
          await walk(child);
        }
      }
    }
  };

  for (const entry of entries) {
    if (entry) {
      await walk(entry);
    }
  }

  return files.length ? files : Array.from(transfer.files);
};