import { normalizePath } from 'vite';
import { join, resolve } from 'node:path';
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { upload } from '@hubspot/local-dev-lib/api/fileMapper';
import { uploadFile } from '@hubspot/local-dev-lib/api/fileManager';
import { loadConfig, getAccountId } from '@hubspot/local-dev-lib/config';
import { LOG_LEVEL, setLogLevel, setLogger, Logger } from '@hubspot/local-dev-lib/logger';
import { pathToFileURL } from 'node:url';
loadConfig("hubspot.config.yml");
const pluginName = 'UploadToHubSpot';
const dynamicImport = async (filePath) => {
    const exported = await import(pathToFileURL(filePath).toString());
    return exported.default;
};
const flattenArray = (arr) => {
    return arr.reduce((flat, toFlatten) => {
        return flat.concat(Array.isArray(toFlatten) ? flattenArray(toFlatten) : toFlatten);
    }, []);
};
const fieldsArrayToJson = async (fields) => {
    const allFields = await Promise.all(flattenArray(fields));
    const jsonFields = allFields.map(field => typeof field.toJSON === 'function' ? field.toJSON() : field);
    return JSON.stringify(jsonFields, null, 2);
};
export default function uploadToHubSpot(options) {
    const { src, dest, account, assets } = options;
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
    const shouldUseFileManager = (filepath) => {
        return !!assets?.src && normalizePath(filepath).includes(normalizePath(assets.src));
    };
    const isFieldsJsFile = (filepath) => {
        return filepath.endsWith('fields.js');
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
            const convertFieldsPromises = files.map(async (filepath) => {
                if (isFieldsJsFile(filepath)) {
                    logger.info(`Found a fields JS file: ${filepath}.`);
                    try {
                        const fieldsFunc = await dynamicImport(filepath);
                        if (typeof fieldsFunc !== 'function')
                            return;
                        const fields = await fieldsFunc({});
                        if (!Array.isArray(fields))
                            return;
                        const writeDir = resolve(srcDir);
                        const finalPath = join(writeDir, 'fields.json');
                        const json = await fieldsArrayToJson(fields);
                        if (!existsSync(writeDir)) {
                            mkdirSync(writeDir, { recursive: true });
                        }
                        writeFileSync(finalPath, json);
                        logger.info(`Converted fields JS file: ${filepath} to ${finalPath}.`);
                    }
                    catch (error) {
                        const errorMsg = (typeof error === 'object' && error !== null && 'message' in error)
                            ? error.message
                            : String(error);
                        logger.error(`Failed to process fields JS file: ${filepath}. Reason: ${errorMsg}`);
                    }
                }
            });
            const uploadPromises = files.map(async (filepath) => {
                const relativePath = normalizePath(filepath.replace(srcDir, '').replace(/^\//, ''));
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
                    if (typeof error === 'object' &&
                        error !== null &&
                        'message' in error &&
                        typeof error.message === 'string' &&
                        error.message.includes('Unknown file type') &&
                        !shouldUseFileManager(filepath)) {
                        logger.info(`Skipping ${uploadDest} as it is not a supported file type.`);
                    }
                    else {
                        const errorMsg = (typeof error === 'object' && error !== null && 'message' in error)
                            ? error.message
                            : String(error);
                        logger.error(`Failed to upload ${uploadDest} to account ${accountId}. Reason: ${errorMsg}`);
                    }
                }
            });
            await Promise.all([...convertFieldsPromises, ...uploadPromises]);
        },
    };
}
