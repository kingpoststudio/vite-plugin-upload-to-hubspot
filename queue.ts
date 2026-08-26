import { join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { upload } from '@hubspot/local-dev-lib/api/fileMapper';
import { uploadFile } from '@hubspot/local-dev-lib/api/fileManager';
import { updateHttpTimeout } from '@hubspot/local-dev-lib/config';

/** HubSpot CMS filemapper default timeout is 15s; large JS/PNG bodies need more. */
export const DEFAULT_TIMEOUT_MS = 60_000;
/** Official `hs cms upload` queues at 10; 5 leaves headroom for large bodies. */
export const DEFAULT_CONCURRENCY = 5;
export const DEFAULT_ATTEMPTS = 4;

export type UploadLogger = {
  log: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
};

export function normalizePath(p: string) {
  return p.replace(/\\/g, '/');
}

export function getAllFiles(dirPath: string): string[] {
  let files: string[] = [];
  const items = readdirSync(dirPath);

  for (const item of items) {
    const fullPath = join(dirPath, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) files = files.concat(getAllFiles(fullPath));
    else files.push(fullPath);
  }

  return files;
}

export function shouldExclude(relativePath: string, exclude: string[]): boolean {
  return exclude.some((pattern) => {
    if (pattern.startsWith('.')) return relativePath.endsWith(pattern);
    return relativePath.includes(pattern);
  });
}

export async function pool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, Math.max(items.length, 0)) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isUnknownFileType(message: string) {
  return message.includes('Unknown file type');
}

export async function uploadQueuedFiles(options: {
  files: string[];
  srcDir: string;
  dest: string;
  accountId: number;
  logger: UploadLogger;
  assets?: { src: string; dest: string };
  exclude?: string[];
  concurrency?: number;
  attempts?: number;
  timeout?: number;
}): Promise<void> {
  const {
    files,
    srcDir,
    dest,
    accountId,
    logger,
    assets,
    exclude = [],
    concurrency = DEFAULT_CONCURRENCY,
    attempts = DEFAULT_ATTEMPTS,
    timeout = DEFAULT_TIMEOUT_MS,
  } = options;

  updateHttpTimeout(String(timeout));

  const shouldUseFileManager = (filepath: string): boolean => {
    return !!assets?.src && normalizePath(filepath).includes(normalizePath(assets.src));
  };

  const pending = files
    .filter((filepath) => {
      const relativePath = normalizePath(filepath.replace(srcDir, '').replace(/^[\\/]/, ''));
      return exclude.length === 0 || !shouldExclude(relativePath, exclude);
    })
    .sort((a, b) => (statSync(a).size ?? 0) - (statSync(b).size ?? 0));

  await pool(pending, concurrency, async (filepath) => {
    const relativePath = normalizePath(filepath.replace(srcDir, '').replace(/^[\\/]/, ''));
    const useFileManager = shouldUseFileManager(filepath);
    const uploadDest = useFileManager
      ? normalizePath(join(assets!.dest, relativePath))
      : normalizePath(join(dest, relativePath));

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (useFileManager) {
          await uploadFile(accountId, filepath, uploadDest);
          logger.success(`Successfully uploaded ${uploadDest} to file manager for account ${accountId}.`);
        } else {
          await upload(accountId, filepath, uploadDest, { timeout });
          logger.success(`Successfully uploaded ${uploadDest} to account ${accountId}.`);
        }
        return;
      } catch (error: unknown) {
        const message = errorMessage(error);
        if (isUnknownFileType(message) && !useFileManager) {
          logger.info(`Skipping ${uploadDest} as it is not a supported file type.`);
          return;
        }
        if (attempt < attempts) {
          logger.info(`Retrying ${uploadDest} (attempt ${attempt}/${attempts}): ${message}`);
          await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
          continue;
        }
        logger.error(`Failed to upload ${uploadDest} to account ${accountId}. Reason: ${message}`);
      }
    }
  });
}
