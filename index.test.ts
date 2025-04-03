/// <reference types="@types/bun" />
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import uploadToHubSpot from './index';
import { normalizePath } from 'vite';
import { join } from 'node:path';

// Mock dependencies
const mockReaddirSync = mock(() => []);
const mockStatSync = mock(() => ({ isDirectory: () => false }));
const mockUpload = mock(() => Promise.resolve());
const mockLoadConfig = mock(() => { });
const mockGetAccountId = mock(() => '12345');
const mockLogger = {
  log: mock(() => { }),
  info: mock(() => { }),
  warn: mock(() => { }),
  success: mock(() => { }),
  error: mock(() => { }),
};
const mockSetLogger = mock(() => { });
const mockSetLogLevel = mock(() => { });
const mockIsConvertableFieldJs = mock(() => false);
const mockFieldsJs = mock(() => ({
  init: mock(() => Promise.resolve()),
  convertFieldsJs: mock(() => Promise.resolve()),
  saveOutput: mock(() => { }),
}));

// Mock module imports
mock.module('node:fs', () => ({
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
}));

mock.module('@hubspot/local-dev-lib/api/fileMapper', () => ({
  upload: mockUpload,
}));

mock.module('@hubspot/local-dev-lib/config', () => ({
  loadConfig: mockLoadConfig,
  getAccountId: mockGetAccountId,
}));

mock.module('@hubspot/local-dev-lib/logger', () => ({
  Logger: class {
    log = mockLogger.log;
    info = mockLogger.info;
    warn = mockLogger.warn;
    success = mockLogger.success;
    error = mockLogger.error;
  },
  setLogger: mockSetLogger,
  setLogLevel: mockSetLogLevel,
  LOG_LEVEL: { LOG: 'log' },
}));

mock.module('@hubspot/local-dev-lib/cms/handleFieldsJS', () => ({
  isConvertableFieldJs: mockIsConvertableFieldJs,
  FieldsJs: mockFieldsJs,
}));

describe('uploadToHubSpot', () => {
  const options = {
    src: './src',
    dest: 'hubspot/dest',
    account: 'test-account',
  };

  beforeEach(() => {
    // Reset mocks before each test
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
    mockUpload.mockReset();
    mockLogger.log.mockReset();
    mockLogger.info.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.success.mockReset();
    mockLogger.error.mockReset();
  });

  test('plugin initializes with correct name', () => {
    const plugin = uploadToHubSpot(options);
    expect(plugin.name).toBe('UploadToHubSpot');
  });

  test('throws error when account not found', () => {
    mockGetAccountId.mockReturnValueOnce(null);
    expect(() => uploadToHubSpot(options)).toThrow(
      'Account test-account not found in hubspot.config.yml.'
    );
  });

  test('handles empty directory', async () => {
    mockReaddirSync.mockReturnValue([]);
    const plugin = uploadToHubSpot(options);

    await plugin.closeBundle();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No files found')
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test('uploads single file successfully using file manager', async () => {
    mockReaddirSync.mockReturnValue(['test.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });

    const plugin = uploadToHubSpot({
      src: './src',
      dest: 'hubspot/dest',
      account: 'test-account',
      assets: { src: './assets', dest: 'hubspot/assets' },
    });

    await plugin.closeBundle();

    expect(mockLogger.success).toHaveBeenCalledWith(
      expect.stringContaining('Successfully uploaded')
    );
  });

  test('uploads single file successfully using default upload', async () => {
    mockReaddirSync.mockReturnValue(['test.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });

    const plugin = uploadToHubSpot({
      src: './src',
      dest: 'hubspot/dest',
      account: 'test-account',
    });

    await plugin.closeBundle();

    expect(mockUpload).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('test.js'),
      normalizePath(join('hubspot/dest', 'test.js'))
    );
    expect(mockLogger.success).toHaveBeenCalledWith(
      expect.stringContaining('Successfully uploaded')
    );
  });

  test('skips unsupported file types', async () => {
    mockReaddirSync.mockReturnValue(['unsupported.file']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });
    mockUpload.mockRejectedValueOnce(new Error('Unknown file type'));

    const plugin = uploadToHubSpot({
      src: './src',
      dest: 'hubspot/dest',
      account: 'test-account',
    });

    await plugin.closeBundle();

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Skipping')
    );
  });

  test('handles upload failure', async () => {
    mockReaddirSync.mockReturnValue(['test.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });
    mockUpload.mockRejectedValueOnce(new Error('Upload failed'));

    const plugin = uploadToHubSpot(options);
    await plugin.closeBundle();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to upload')
    );
  });

  test('processes convertible FieldsJS file', async () => {
    mockReaddirSync.mockReturnValue(['fields1.js', 'fields2.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });
    mockIsConvertableFieldJs.mockReturnValue(true);

    const plugin = uploadToHubSpot(options);
    await plugin.closeBundle();

    expect(mockFieldsJs).toHaveBeenCalledTimes(2);
  });

  test('recursively processes directory', async () => {
    mockReaddirSync
      .mockReturnValueOnce(['folder', 'file1.js'])
      .mockReturnValueOnce(['file2.js']);
    mockStatSync
      .mockReturnValueOnce({ isDirectory: () => false })
      .mockReturnValue({ isDirectory: () => false });

    const plugin = uploadToHubSpot(options);
    await plugin.closeBundle();

    expect(mockUpload).toHaveBeenCalledTimes(2);
  });
});
