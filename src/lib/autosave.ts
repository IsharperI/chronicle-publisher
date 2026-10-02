/**
 * Autosave: keeps the latest version of the course in this browser's
 * IndexedDB, so a refresh, crash or closed tab doesn't lose work. On the next
 * visit AutosaveManager.tsx offers to restore it.
 *
 * IndexedDB (not localStorage) because courses embed media as base64 and can
 * be tens of MB; localStorage is capped at about 5 MB. Autosave is per
 * browser and per device: it's a safety net, not a replacement for Home →
 * Save, which produces a file you can back up or share.
 *
 * Also holds a tiny status store (saving / saved / error) that the ribbon's
 * AutosaveStatus reads through useAutosaveStatus().
 */
import { useSyncExternalStore } from 'react';
import type { ProjectData } from './project';

const DB_NAME = 'chronicle-publisher';
const STORE = 'autosave';
const KEY = 'current';

export interface AutosaveRecord {
  version: 1;
  savedAt: number;
  title: string;
  slideCount: number;
  project: ProjectData;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open browser storage'));
    req.onblocked = () => reject(new Error('Browser storage is blocked by another tab'));
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
      tx.onerror = () => reject(tx.error ?? new Error('Browser storage error'));
      tx.onabort = () => reject(tx.error ?? new Error('Browser storage write was aborted (it may be full)'));
    });
  } finally {
    db.close();
  }
}

export async function readAutosave(): Promise<AutosaveRecord | null> {
  const rec = await run<AutosaveRecord>('readonly', (s) => s.get(KEY));
  return rec && rec.version === 1 && rec.project && Array.isArray(rec.project.slides) ? rec : null;
}

export async function writeAutosave(project: ProjectData): Promise<void> {
  const record: AutosaveRecord = {
    version: 1,
    savedAt: Date.now(),
    title: project.playerSettings?.courseTitle || '',
    slideCount: project.slides.length,
    project,
  };
  await run('readwrite', (s) => s.put(record, KEY));
}

export async function clearAutosave(): Promise<void> {
  await run('readwrite', (s) => s.delete(KEY));
}

/** Ask the browser not to evict our storage when disk space runs low (best effort). */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* not supported: fine */
  }
}

// ---- status store ---------------------------------------------------------

export type AutosaveStatus =
  | { kind: 'off' }
  | { kind: 'on' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

let status: AutosaveStatus = { kind: 'off' };
const listeners = new Set<() => void>();

export function setAutosaveStatus(next: AutosaveStatus): void {
  status = next;
  listeners.forEach((l) => l());
}

export function getAutosaveStatus(): AutosaveStatus {
  return status;
}

export function useAutosaveStatus(): AutosaveStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getAutosaveStatus,
    getAutosaveStatus,
  );
}
