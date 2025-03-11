import { normalizePath } from 'vite';
import { join, resolve } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { upload } from '@hubspot/local-dev-lib/api/fileMapper';
import { loadConfig, getAccountId } from '@hubspot/local-dev-lib/config';
import { LOG_LEVEL, setLogLevel, setLogger, Logger } from '@hubspot/local-dev-lib/logger';
loadConfig("hubspot.config.yml");
const pluginName = 'UploadToHubSpot';
export default function uploadToHubSpot(options) {
    const { src, dest, account } = options;
    const accountId = getAccountId(account);
    if (!accountId) {
        throw new Error(`Account ${account} not found in hubspot.config.yml.`);
    }
    const logger = new Logger();
    const getAllFiles = (dirPath) => {
        let files = [];
        const items = readdirSync(dirPath);
        for (const item of items) {
            const fullPath = join(dirPath, item);
            const stat = statSync(fullPath);
            if (stat.isDirectory())
                files = files.concat(getAllFiles(fullPath));
            else
                files.push(fullPath);
        }
        return files;
    };
    return {
        name: pluginName,
        configResolved() {
            setLogger(logger);
            setLogLevel(LOG_LEVEL.LOG);
        },
        async closeBundle() {
            const srcDir = resolve(src);
            logger.log(`\nUploading files from ${srcDir} to account ${accountId}.`);
            logger.info(`Scanning ${srcDir} for files to upload.`);
            const files = getAllFiles(srcDir);
            if (files.length === 0) {
                logger.warn(`No files found in ${srcDir}`);
                return;
            }
            const uploadPromises = files.map(async (filepath) => {
                const relativePath = normalizePath(filepath.replace(srcDir, '').replace(/^\//, ''));
                const uploadDest = normalizePath(join(dest, relativePath));
                try {
                    await upload(accountId, filepath, uploadDest);
                    logger.success(`Successfully uploaded ${uploadDest} to account ${accountId}.`);
                }
                catch (error) {
                    logger.error(`Failed to upload ${uploadDest} to account ${accountId}. \n\t${error.message}`);
                }
            });
            await Promise.all(uploadPromises);
        },
    };
}
