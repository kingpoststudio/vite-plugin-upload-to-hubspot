import { join, resolve } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { upload } from '@hubspot/local-dev-lib/api/fileMapper';
import { uploadFile } from '@hubspot/local-dev-lib/api/fileManager';
import { loadConfig, getAccountId } from '@hubspot/local-dev-lib/config';
import { LOG_LEVEL, setLogLevel, setLogger, Logger } from '@hubspot/local-dev-lib/logger';
const normalizePath = (p) => p.replace(/\\/g, '/');
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
const shouldExclude = (relativePath, exclude) => {
    return exclude.some((pattern) => {
        // Extension match (e.g., '.ts')
        if (pattern.startsWith('.'))
            return relativePath.endsWith(pattern);
        // Substring match
        return relativePath.includes(pattern);
    });
};
/**
 * Standalone upload function — uploads files from a local directory to HubSpot.
 * Can be used without Vite.
 */
export async function uploadFiles(options) {
    const { src, dest, account, assets, exclude = [], configPath = 'hubspot.config.yml', } = options;
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
    const shouldUseFileManager = (filepath) => {
        return !!assets?.src && normalizePath(filepath).includes(normalizePath(assets.src));
    };
    const uploadPromises = files.map(async (filepath) => {
        const relativePath = normalizePath(filepath.replace(srcDir, '').replace(/^\//, ''));
        // Skip excluded files
        if (exclude.length > 0 && shouldExclude(relativePath, exclude)) {
            return;
        }
        const uploadDest = shouldUseFileManager(filepath)
            ? normalizePath(join(assets.dest, relativePath))
            : normalizePath(join(dest, relativePath));
        try {
            if (shouldUseFileManager(filepath)) {
                await uploadFile(accountId, filepath, uploadDest);
                logger.success(`Successfully uploaded ${uploadDest} to file manager for account ${accountId}.`);
            }
            else {
                await upload(accountId, filepath, uploadDest);
                logger.success(`Successfully uploaded ${uploadDest} to account ${accountId}.`);
            }
        }
        catch (error) {
            if (error.message?.includes('Unknown file type') && !shouldUseFileManager(filepath))
                logger.info(`Skipping ${uploadDest} as it is not a supported file type.`);
            else
                logger.error(`Failed to upload ${uploadDest} to account ${accountId}. Reason: ${error.message}`);
        }
    });
    await Promise.all(uploadPromises);
}
