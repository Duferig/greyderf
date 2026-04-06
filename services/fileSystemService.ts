export const isDirectoryPickerSupported = (): boolean => {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
};

export const pickDirectory = async (): Promise<FileSystemDirectoryHandle> => {
  return window.showDirectoryPicker({ mode: 'readwrite' });
};

export const areSameDirectoryHandles = async (
  left: FileSystemDirectoryHandle | null,
  right: FileSystemDirectoryHandle | null
): Promise<boolean> => {
  if (!left || !right) return false;

  try {
    return await left.isSameEntry(right);
  } catch {
    return false;
  }
};

export const ensureHandlePermission = async (
  handle: FileSystemHandle | null,
  mode: 'read' | 'readwrite' = 'read'
): Promise<boolean> => {
  if (!handle) return false;

  const options = { mode };

  if ('queryPermission' in handle) {
    const current = await handle.queryPermission(options);
    if (current === 'granted') {
      return true;
    }
  }

  if ('requestPermission' in handle) {
    const requested = await handle.requestPermission(options);
    return requested === 'granted';
  }

  return false;
};

export const listChapterFiles = async (directoryHandle: FileSystemDirectoryHandle): Promise<string[]> => {
  const files: string[] = [];
  const reservedOutputFiles = new Set([
    'full_translation.txt',
    'approved-glossary.json',
    'review-queue.json',
  ]);

  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind !== 'file') continue;
    const lowered = name.toLowerCase();
    if (reservedOutputFiles.has(lowered)) continue;
    if (lowered.endsWith('.txt') || lowered.endsWith('.md')) {
      files.push(name);
    }
  }

  return files;
};

export const readTextFileFromDirectory = async (
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<string> => {
  const fileHandle = await directoryHandle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  return file.text();
};

export const readTextFileFromHandle = async (file: File): Promise<string> => {
  return file.text();
};

export const writeTextFileToDirectory = async (
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  text: string
): Promise<void> => {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
};

export const fileExistsInDirectory = async (
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<boolean> => {
  try {
    await directoryHandle.getFileHandle(fileName);
    return true;
  } catch {
    return false;
  }
};

export const readOutputFileIfExists = async (
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<string | null> => {
  const exists = await fileExistsInDirectory(directoryHandle, fileName);
  if (!exists) return null;
  return readTextFileFromDirectory(directoryHandle, fileName);
};

export const deleteFileFromDirectoryIfExists = async (
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string
): Promise<void> => {
  try {
    await directoryHandle.removeEntry(fileName);
  } catch {
    // Ignore missing files during cleanup.
  }
};
