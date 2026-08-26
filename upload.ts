import { resolve } from 'node:path';
import { loadConfig, getAccountId } from '@hubspot/local-dev-lib/config';
import { LOG_LEVEL, setLogLevel, setLogger, Logger } from '@hubspot/local-dev-lib/logger';
import {
  DEFAULT_ATTEMPTS,
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  getAllFiles,
  uploadQueuedFiles,
} from './queue.js';

export type UploadOptions = {
  /** Source directory to upload from. */
  src: string;
  /** Destination path on HubSpot. */
  dest: string;
  /** Account name or ID from hubspot.config.yml. */
  account?: string;
  /** File manager upload config for assets. */
  assets?: {
    src: string;
    dest: string;
  };
  /** Glob patterns or extensions to exclude (e.g. ['.ts']). Matched against relative file paths. */
  exclude?: string[];
  /** Path to hubspot.config.yml. Defaults to "hubspot.config.yml". */
  configPath?: string;
  /** Max parallel CMS uploads. Default 5. */
  concurrency?: number;
  /** Attempts per file, including the first try. Default 4. */
  attempts?: number;
  /** Per-request timeout in ms. Default 60000. */
  timeout?: number;
};

/**
 * Standalone upload function — uploads files from a local directory to HubSpot.
 * Can be used without Vite.
 */
export async function uploadFiles(options: UploadOptions): Promise<void> {
  const {
    src,
    dest,
    account,
    assets,
    exclude = [],
    configPath = 'hubspot.config.yml',
    concurrency = DEFAULT_CONCURRENCY,
    attempts = DEFAULT_ATTEMPTS,
    timeout = DEFAULT_TIMEOUT_MS,
  } = options;

  loadConfig(configPath);

  const accountId = getAccountId(account);
  if (!accountId) {
    throw new Error(`Account ${account} not found in ${configPath}.`);
  }

  const logger = new Logger();
  setLogger(logger);
  setLogLevel(LOG_LEVEL.LOG);

  const srcDir = resolve(src);
  logger.log(`\nUploading files from ${srcDir} to account ${accountId}.`);
  logger.info(`Scanning ${srcDir} for files to upload.`);

  const files = getAllFiles(srcDir);

  if (files.length === 0) {
    logger.warn(`No files found in ${srcDir}`);
    return;
  }

  await uploadQueuedFiles({
    files,
    srcDir,
    dest,
    accountId,
    logger,
    assets,
    exclude,
    concurrency,
    attempts,
    timeout,
  });
}
