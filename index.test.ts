/// <reference types="@types/bun" />
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import uploadToHubSpot from './index';
import { uploadFiles } from './upload';
import { normalizePath } from 'vite';
import { join } from 'node:path';

const DEFAULT_TIMEOUT = { timeout: 60_000 };

const mockReaddirSync = mock(() => []);
const mockStatSync = mock(() => ({ isDirectory: () => false, size: 1 }));
const mockUpload = mock(() => Promise.resolve());
const mockLoadConfig = mock(() => { });
const mockGetAccountId = mock(() => '12345');
const mockUpdateHttpTimeout = mock(() => { });
const mockLogger = {
  log: mock(() => { }),
  info: mock(() => { }),
  warn: mock(() => { }),
  success: mock(() => { }),
  error: mock(() => { }),
};
const mockSetLogger = mock(() => { });
const mockSetLogLevel = mock(() => { });
const mockUploadFile = mock(() => Promise.resolve());

const mockExistsSync = mock(() => true);

async function runUpload(plugin: { writeBundle?: unknown }) {
  const hook = plugin.writeBundle as
    | (() => void | Promise<void>)
    | { handler: () => void | Promise<void> }
    | undefined;
  if (!hook) throw new Error('writeBundle hook missing');
  if (typeof hook === 'function') await hook();
  else await hook.handler();
}

mock.module('node:fs', () => ({
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  existsSync: mockExistsSync,
}));

mock.module('@hubspot/local-dev-lib/api/fileMapper', () => ({
  upload: mockUpload,
}));

mock.module('@hubspot/local-dev-lib/api/fileManager', () => ({
  uploadFile: mockUploadFile,
}));

mock.module('@hubspot/local-dev-lib/config', () => ({
  loadConfig: mockLoadConfig,
  getAccountId: mockGetAccountId,
  updateHttpTimeout: mockUpdateHttpTimeout,
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

describe('uploadToHubSpot', () => {
  const options = {
    src: './src',
    dest: 'hubspot/dest',
    account: 'test-account',
  };

  beforeEach(() => {
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(true);
    mockUpload.mockReset();
    mockUpload.mockResolvedValue(undefined);
    mockUploadFile.mockReset();
    mockUploadFile.mockResolvedValue(undefined);
    mockUpdateHttpTimeout.mockReset();
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

  test('skips upload when output directory is missing', async () => {
    mockExistsSync.mockReturnValue(false);
    const plugin = uploadToHubSpot(options);

    await runUpload(plugin);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('does not exist; skipping upload')
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test('handles empty directory', async () => {
    mockReaddirSync.mockReturnValue([]);
    const plugin = uploadToHubSpot(options);

    await runUpload(plugin);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No files found')
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test('uploads file via file manager when path matches assets.src', async () => {
    mockReaddirSync.mockReturnValue(['test.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });

    const plugin = uploadToHubSpot({
      src: './src',
      dest: 'hubspot/dest',
      account: 'test-account',
      assets: { src: 'src', dest: 'hubspot/assets' },
    });

    await runUpload(plugin);

    expect(mockUploadFile).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('test.js'),
      expect.stringContaining('hubspot/assets')
    );
    expect(mockLogger.success).toHaveBeenCalledWith(
      expect.stringContaining('Successfully uploaded')
    );
  });

  test('uploads single file successfully using default upload', async () => {
    mockReaddirSync.mockReturnValue(['test.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });

    const plugin = uploadToHubSpot({
      src: './src',
      dest: 'hubspot/dest',
      account: 'test-account',
    });

    await runUpload(plugin);

    expect(mockUpload).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('test.js'),
      normalizePath(join('hubspot/dest', 'test.js')),
      DEFAULT_TIMEOUT,
    );
    expect(mockUpdateHttpTimeout).toHaveBeenCalledWith('60000');
    expect(mockLogger.success).toHaveBeenCalledWith(
      expect.stringContaining('Successfully uploaded')
    );
  });

  test('skips unsupported file types', async () => {
    mockReaddirSync.mockReturnValue(['unsupported.file']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });
    mockUpload.mockRejectedValueOnce(new Error('Unknown file type'));

    const plugin = uploadToHubSpot({
      src: './src',
      dest: 'hubspot/dest',
      account: 'test-account',
    });

    await runUpload(plugin);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Skipping')
    );
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  test('handles upload failure without throwing', async () => {
    mockReaddirSync.mockReturnValue(['test.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });
    mockUpload.mockRejectedValue(new Error('Upload failed'));

    const plugin = uploadToHubSpot({ ...options, attempts: 2 });
    await expect(runUpload(plugin)).resolves.toBeUndefined();

    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to upload')
    );
  });

  test('retries a failed upload then succeeds', async () => {
    mockReaddirSync.mockReturnValue(['test.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });
    mockUpload
      .mockRejectedValueOnce(new Error('The post in account 12345 failed'))
      .mockResolvedValueOnce(undefined);

    const plugin = uploadToHubSpot({ ...options, attempts: 3 });
    await runUpload(plugin);

    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Retrying')
    );
    expect(mockLogger.success).toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('calls setLogger and setLogLevel on configResolved', () => {
    const plugin = uploadToHubSpot(options);
    (plugin as any).configResolved();
    expect(mockSetLogger).toHaveBeenCalled();
    expect(mockSetLogLevel).toHaveBeenCalled();
  });

  test('skips files matching exclude extension pattern', async () => {
    mockReaddirSync.mockReturnValue(['style.ts', 'main.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });

    const plugin = uploadToHubSpot({ ...options, exclude: ['.ts'] });
    await runUpload(plugin);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('main.js'),
      expect.any(String),
      DEFAULT_TIMEOUT,
    );
  });

  test('skips files matching exclude substring pattern', async () => {
    mockReaddirSync.mockReturnValue(['chunk-abc.js', 'main.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });

    const plugin = uploadToHubSpot({ ...options, exclude: ['chunk'] });
    await runUpload(plugin);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('main.js'),
      expect.any(String),
      DEFAULT_TIMEOUT,
    );
  });

  test('recursively uploads files from subdirectories', async () => {
    mockReaddirSync
      .mockReturnValueOnce(['subdir', 'file1.js'])
      .mockReturnValueOnce(['file2.js']);
    mockStatSync
      .mockReturnValueOnce({ isDirectory: () => true, size: 0 })
      .mockReturnValue({ isDirectory: () => false, size: 1 });

    const plugin = uploadToHubSpot(options);
    await runUpload(plugin);

    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  test('passes a custom timeout through to filemapper', async () => {
    mockReaddirSync.mockReturnValue(['test.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });

    const plugin = uploadToHubSpot({ ...options, timeout: 12_000 });
    await runUpload(plugin);

    expect(mockUpdateHttpTimeout).toHaveBeenCalledWith('12000');
    expect(mockUpload).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('test.js'),
      expect.any(String),
      { timeout: 12_000 },
    );
  });
});

describe('uploadFiles', () => {
  beforeEach(() => {
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });
    mockUpload.mockReset();
    mockUpload.mockResolvedValue(undefined);
    mockUploadFile.mockReset();
    mockUploadFile.mockResolvedValue(undefined);
    mockUpdateHttpTimeout.mockReset();
    mockLogger.log.mockReset();
    mockLogger.info.mockReset();
    mockLogger.warn.mockReset();
    mockLogger.success.mockReset();
    mockLogger.error.mockReset();
  });

  test('throws error when account not found', async () => {
    mockGetAccountId.mockReturnValueOnce(null);
    await expect(uploadFiles({ src: './src', dest: 'hubspot/dest' })).rejects.toThrow(
      'not found in hubspot.config.yml'
    );
  });

  test('uses custom configPath when provided', async () => {
    mockReaddirSync.mockReturnValue([]);
    await uploadFiles({ src: './src', dest: 'hubspot/dest', configPath: 'custom.config.yml' });
    expect(mockLoadConfig).toHaveBeenCalledWith('custom.config.yml');
  });

  test('handles empty directory', async () => {
    mockReaddirSync.mockReturnValue([]);
    await uploadFiles({ src: './src', dest: 'hubspot/dest' });
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('No files found'));
    expect(mockUpload).not.toHaveBeenCalled();
  });

  test('uploads single file via regular upload', async () => {
    mockReaddirSync.mockReturnValue(['main.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });

    await uploadFiles({ src: './src', dest: 'hubspot/dest', account: 'test' });

    expect(mockUpload).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('main.js'),
      expect.stringContaining('hubspot/dest'),
      DEFAULT_TIMEOUT,
    );
    expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('Successfully uploaded'));
  });

  test('uploads file via file manager when path matches assets.src', async () => {
    mockReaddirSync.mockReturnValue(['image.png']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });

    await uploadFiles({
      src: './src',
      dest: 'hubspot/dest',
      assets: { src: 'src', dest: 'hubspot/assets' },
    });

    expect(mockUploadFile).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('image.png'),
      expect.stringContaining('hubspot/assets')
    );
    expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('Successfully uploaded'));
  });

  test('skips files matching exclude extension pattern', async () => {
    mockReaddirSync.mockReturnValue(['styles.css', 'main.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });

    await uploadFiles({ src: './src', dest: 'hubspot/dest', exclude: ['.css'] });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('main.js'),
      expect.any(String),
      DEFAULT_TIMEOUT,
    );
  });

  test('skips files matching exclude substring pattern', async () => {
    mockReaddirSync.mockReturnValue(['chunk-abc.js', 'main.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });

    await uploadFiles({ src: './src', dest: 'hubspot/dest', exclude: ['chunk'] });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('main.js'),
      expect.any(String),
      DEFAULT_TIMEOUT,
    );
  });

  test('skips unsupported file types', async () => {
    mockReaddirSync.mockReturnValue(['data.bin']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });
    mockUpload.mockRejectedValueOnce(new Error('Unknown file type'));

    await uploadFiles({ src: './src', dest: 'hubspot/dest' });

    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Skipping'));
  });

  test('handles upload failure', async () => {
    mockReaddirSync.mockReturnValue(['main.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false, size: 1 });
    mockUpload.mockRejectedValue(new Error('Network error'));

    await uploadFiles({ src: './src', dest: 'hubspot/dest', attempts: 2 });

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to upload'));
  });

  test('recursively uploads files from subdirectories', async () => {
    mockReaddirSync
      .mockReturnValueOnce(['assets', 'index.js'])
      .mockReturnValueOnce(['logo.png']);
    mockStatSync
      .mockReturnValueOnce({ isDirectory: () => true, size: 0 })
      .mockReturnValue({ isDirectory: () => false, size: 1 });

    await uploadFiles({ src: './src', dest: 'hubspot/dest' });

    expect(mockUpload).toHaveBeenCalledTimes(2);
  });
});
