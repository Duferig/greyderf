import { ProjectState } from '../types';

const DB_NAME = 'noveltranslator-local-batch-db';
const DB_VERSION = 1;
const STORE_NAME = 'project_store';
const PROJECT_KEY = 'current_project';
const SOURCE_HANDLE_KEY = 'source_directory_handle';
const OUTPUT_HANDLE_KEY = 'output_directory_handle';

type PersistedValue = ProjectState | FileSystemDirectoryHandle | null;

const openDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

const readValue = async <T extends PersistedValue>(key: string): Promise<T | null> => {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve((request.result as T) ?? null);

    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
};

const writeValue = async (key: string, value: PersistedValue): Promise<void> => {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
};

export const loadPersistedProject = async (): Promise<ProjectState | null> => {
  return readValue<ProjectState>(PROJECT_KEY);
};

export const savePersistedProject = async (projectState: ProjectState): Promise<void> => {
  await writeValue(PROJECT_KEY, projectState);
};

export const saveDirectoryHandle = async (
  kind: 'source' | 'output',
  handle: FileSystemDirectoryHandle | null
): Promise<void> => {
  const key = kind === 'source' ? SOURCE_HANDLE_KEY : OUTPUT_HANDLE_KEY;
  await writeValue(key, handle);
};

export const loadDirectoryHandles = async (): Promise<{
  sourceHandle: FileSystemDirectoryHandle | null;
  outputHandle: FileSystemDirectoryHandle | null;
}> => {
  const [sourceHandle, outputHandle] = await Promise.all([
    readValue<FileSystemDirectoryHandle>(SOURCE_HANDLE_KEY),
    readValue<FileSystemDirectoryHandle>(OUTPUT_HANDLE_KEY),
  ]);

  return { sourceHandle, outputHandle };
};
