import type { Plugin } from 'vite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadConfig, getAccountId } from '@hubspot/local-dev-lib/config';
import { LOG_LEVEL, setLogLevel, setLogger, Logger } from '@hubspot/local-dev-lib/logger';
import {
  DEFAULT_ATTEMPTS,
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  getAllFiles,
  uploadQueuedFiles,
} from './queue.js';

loadConfig('hubspot.config.yml');

const pluginName = 'UploadToHubSpot';

type Options = {
  src: string;
  dest: string;
  account?: string;
  exclude?: string[];
  assets?: {
    src: string;
    dest: string;
  };
  concurrency?: number;
  attempts?: number;
  timeout?: number;
};

export default function uploadToHubSpot(options: Options): Plugin {
  const {
    src,
    dest,
    account,
    assets,
    exclude = [],
    concurrency = DEFAULT_CONCURRENCY,
    attempts = DEFAULT_ATTEMPTS,
    timeout = DEFAULT_TIMEOUT_MS,
  } = options;
  const accountId = getAccountId(account);

  if (!accountId) {
    throw new Error(`Account ${account} not found in hubspot.config.yml.`);
  }

  const logger = new Logger();

  const doUpload = async (): Promise<void> => {
    const srcDir = resolve(src);

    // Avoid masking earlier build failures: closeBundle still runs after errors,
    // often once emptyOutDir has already removed the output directory.
    if (!existsSync(srcDir)) {
      logger.warn(
        `Output directory ${srcDir} does not exist; skipping upload.`,
      );
      return;
    }

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
  };

  return {
    name: pluginName,

    configResolved() {
      setLogger(logger);
      setLogLevel(LOG_LEVEL.LOG);
    },

    // Prefer writeBundle (post/sequential) so we run after files — including
    // vite-plugin-static-copy — are on disk, and only after a successful write.
    writeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        await doUpload();
      },
    },
  };
}
