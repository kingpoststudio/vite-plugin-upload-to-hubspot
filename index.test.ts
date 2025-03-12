import { describe, it, expect, beforeAll, vi } from 'bun:test';
import { resolve } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import uploadToHubSpot from './index';
import { FieldsJs, isConvertableFieldJs } from '@hubspot/local-dev-lib/cms/handleFieldsJS';
import { upload } from '@hubspot/local-dev-lib/api/fileMapper';
import { Logger } from '@hubspot/local-dev-lib/logger';

// Mock dependencies
vi.mock('node:fs', () => ({
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));
vi.mock('@hubspot/local-dev-lib/api/fileMapper', () => ({
  upload: vi.fn(),
}));
vi.mock('@hubspot/local-dev-lib/cms/handleFieldsJS', () => ({
  FieldsJs: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    convertFieldsJs: vi.fn(),
    saveOutput: vi.fn(),
  })),
  isConvertableFieldJs: vi.fn(),
}));
vi.mock('@hubspot/local-dev-lib/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('uploadToHubSpot plugin', () => {
  const options = {
    src: 'src',
    dest: 'dest',
    account: 'develop',
  };

  const srcDir = resolve(options.src);
  const accountId = '12345';

  beforeAll(() => {
    vi.mocked(readdirSync).mockReturnValue(['file1.js', 'file2.js']);
    vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as any);
    vi.mocked(isConvertableFieldJs).mockReturnValue(true);
    vi.mocked(upload).mockResolvedValue({});
  });

  it('should log messages and upload files', async () => {
    const plugin = uploadToHubSpot(options);
    const logger = new Logger();

    await plugin.closeBundle.call({ logger });

    expect(logger.log).toHaveBeenCalledWith(`\nUploading files from ${srcDir} to account ${accountId}.`);
    expect(logger.info).toHaveBeenCalledWith(`Scanning ${srcDir} for files to upload.`);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.success).toHaveBeenCalledWith(`Successfully uploaded dest/file1.js to account ${accountId}.`);
    expect(logger.success).toHaveBeenCalledWith(`Successfully uploaded dest/file2.js to account ${accountId}.`);
  });

  it('should convert fields.js files to JSON', async () => {
    const plugin = uploadToHubSpot(options);
    const logger = new Logger();

    await plugin.closeBundle.call({ logger });

    expect(FieldsJs).toHaveBeenCalledTimes(2);
    expect(FieldsJs.prototype.init).toHaveBeenCalledTimes(2);
    expect(FieldsJs.prototype.convertFieldsJs).toHaveBeenCalledTimes(2);
    expect(FieldsJs.prototype.saveOutput).toHaveBeenCalledTimes(2);
    expect(logger.success).toHaveBeenCalledWith(`Converted src/file1.js to JSON.`);
    expect(logger.success).toHaveBeenCalledWith(`Converted src/file2.js to JSON.`);
  });

  it('should warn if no files are found', async () => {
    vi.mocked(readdirSync).mockReturnValue([]);
    const plugin = uploadToHubSpot(options);
    const logger = new Logger();

    await plugin.closeBundle.call({ logger });

    expect(logger.warn).toHaveBeenCalledWith(`No files found in ${srcDir}`);
  });

  it('should handle upload errors', async () => {
    vi.mocked(upload).mockRejectedValue(new Error('Upload failed'));
    const plugin = uploadToHubSpot(options);
    const logger = new Logger();

    await plugin.closeBundle.call({ logger });

    expect(logger.error).toHaveBeenCalledWith(`Failed to upload dest/file1.js to account ${accountId}. \n\tUpload failed`);
    expect(logger.error).toHaveBeenCalledWith(`Failed to upload dest/file2.js to account ${accountId}. \n\tUpload failed`);
  });
});
