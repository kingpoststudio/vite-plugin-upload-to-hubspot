import { normalizePath } from 'vite';
import { join, resolve } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { upload } from '@hubspot/local-dev-lib/api/fileMapper';
import { uploadFile } from '@hubspot/local-dev-lib/api/fileManager';
import { loadConfig, getAccountId } from '@hubspot/local-dev-lib/config';
import { LOG_LEVEL, setLogLevel, setLogger, Logger } from '@hubspot/local-dev-lib/logger';
import { FieldsJs, isConvertableFieldJs } from '@hubspot/local-dev-lib/cms/handleFieldsJS';

loadConfig("hubspot.config.yml");

const pluginName = 'UploadToHubSpot';

type Options = {
  src: string;
  dest: string;
  account?: string;
  assets?: {
    src: string;
    dest: string;
  }
};

export default function uploadToHubSpot(options: Options) {
  const { src, dest, account, assets } = options;
  const accountId = getAccountId(account);

  if (!accountId) {
    throw new Error(`Account ${account} not found in hubspot.config.yml.`);
  }

  const logger = new Logger();

  const getAllFiles = (dirPath: string): string[] => {
    let files: string[] = [];
    const items = readdirSync(dirPath);

    for (const item of items) {
      const fullPath = join(dirPath, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) files = files.concat(getAllFiles(fullPath));
      else files.push(fullPath);
    }

    return files;
  };

  const shouldUseFileManager = (filepath: string): boolean => {
    return !!assets?.src && normalizePath(filepath).includes(normalizePath(assets.src));
  }

  return {
    name: pluginName,

    configResolved() {
      setLogger(logger);
      setLogLevel(LOG_LEVEL.LOG);
    },

    async closeBundle(): Promise<void> {
      const srcDir = resolve(src);
      logger.log(`\nUploading files from ${srcDir} to account ${accountId}.`);
      logger.info(`Scanning ${srcDir} for files to upload.`);

      const files = getAllFiles(srcDir);

      if (files.length === 0) {
        logger.warn(`No files found in ${srcDir}`);
        return;
      }

      const convertFieldsPromises = files.map(async (filepath: string) => {
        if (isConvertableFieldJs(srcDir, filepath, true)) {
          logger.info(`Found a fields JS file: ${filepath}.`);
          const fieldsJs = new FieldsJs(srcDir, filepath, srcDir);
          await fieldsJs.init();
        }
      });

      const uploadPromises = files.map(async (filepath: string) => {
        const relativePath = normalizePath(filepath.replace(srcDir, '').replace(/^\//, ''));
        const uploadDest = shouldUseFileManager(filepath)
          ? normalizePath(join(assets!.dest, relativePath))
          : normalizePath(join(dest, relativePath));

        try {
          if (shouldUseFileManager(filepath)) {
            await uploadFile(accountId, filepath, uploadDest);
            logger.success(`Successfully uploaded ${uploadDest} to file manager for account ${accountId}.`);
          } else {
            await upload(accountId, filepath, uploadDest);
            logger.success(`Successfully uploaded ${uploadDest} to account ${accountId}.`);
          }
        } catch (error: any) {
          if (error.message?.includes('Unknown file type') && !shouldUseFileManager(filepath))
            logger.info(`Skipping ${uploadDest} as it is not a supported file type.`);
          else
            logger.error(`Failed to upload ${uploadDest} to account ${accountId}. Reason: ${error.message}`);
        }
      });

      await Promise.all([...convertFieldsPromises, ...uploadPromises]);
    }
  }
}
