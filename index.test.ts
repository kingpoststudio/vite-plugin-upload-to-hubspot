/// <reference types="@types/bun" />
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import uploadToHubSpot from './index';
import { uploadFiles } from './upload';
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
const mockUploadFile = mock(() => Promise.resolve());

// Mock module imports
mock.module('node:fs', () => ({
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
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
    mockUpload.mockReset();
    mockUploadFile.mockReset();
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

  test('uploads file via file manager when path matches assets.src', async () => {
    mockReaddirSync.mockReturnValue(['test.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });

    const plugin = uploadToHubSpot({
      src: './src',
      dest: 'hubspot/dest',
      account: 'test-account',
      assets: { src: 'src', dest: 'hubspot/assets' },
    });

    await plugin.closeBundle();

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

  test('calls setLogger and setLogLevel on configResolved', () => {
    const plugin = uploadToHubSpot(options);
    (plugin as any).configResolved();
    expect(mockSetLogger).toHaveBeenCalled();
    expect(mockSetLogLevel).toHaveBeenCalled();
  });

  test('skips files matching exclude extension pattern', async () => {
    mockReaddirSync.mockReturnValue(['style.ts', 'main.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });

    const plugin = uploadToHubSpot({ ...options, exclude: ['.ts'] });
    await plugin.closeBundle();

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith('12345', expect.stringContaining('main.js'), expect.any(String));
  });

  test('skips files matching exclude substring pattern', async () => {
    mockReaddirSync.mockReturnValue(['chunk-abc.js', 'main.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });

    const plugin = uploadToHubSpot({ ...options, exclude: ['chunk'] });
    await plugin.closeBundle();

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith('12345', expect.stringContaining('main.js'), expect.any(String));
  });

  test('recursively uploads files from subdirectories', async () => {
    mockReaddirSync
      .mockReturnValueOnce(['subdir', 'file1.js'])
      .mockReturnValueOnce(['file2.js']);
    mockStatSync
      .mockReturnValueOnce({ isDirectory: () => true })
      .mockReturnValue({ isDirectory: () => false });

    const plugin = uploadToHubSpot(options);
    await plugin.closeBundle();

    expect(mockUpload).toHaveBeenCalledTimes(2);
  });
});

describe('uploadFiles', () => {
  beforeEach(() => {
    mockReaddirSync.mockReset();
    mockStatSync.mockReset();
    mockUpload.mockReset();
    mockUploadFile.mockReset();
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
    mockStatSync.mockReturnValue({ isDirectory: () => false });

    await uploadFiles({ src: './src', dest: 'hubspot/dest', account: 'test' });

    expect(mockUpload).toHaveBeenCalledWith(
      '12345',
      expect.stringContaining('main.js'),
      expect.stringContaining('hubspot/dest')
    );
    expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining('Successfully uploaded'));
  });

  test('uploads file via file manager when path matches assets.src', async () => {
    mockReaddirSync.mockReturnValue(['image.png']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });

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
    mockStatSync.mockReturnValue({ isDirectory: () => false });

    await uploadFiles({ src: './src', dest: 'hubspot/dest', exclude: ['.css'] });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith('12345', expect.stringContaining('main.js'), expect.any(String));
  });

  test('skips files matching exclude substring pattern', async () => {
    mockReaddirSync.mockReturnValue(['chunk-abc.js', 'main.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });

    await uploadFiles({ src: './src', dest: 'hubspot/dest', exclude: ['chunk'] });

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith('12345', expect.stringContaining('main.js'), expect.any(String));
  });

  test('skips unsupported file types', async () => {
    mockReaddirSync.mockReturnValue(['data.bin']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });
    mockUpload.mockRejectedValueOnce(new Error('Unknown file type'));

    await uploadFiles({ src: './src', dest: 'hubspot/dest' });

    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Skipping'));
  });

  test('handles upload failure', async () => {
    mockReaddirSync.mockReturnValue(['main.js']);
    mockStatSync.mockReturnValue({ isDirectory: () => false });
    mockUpload.mockRejectedValueOnce(new Error('Network error'));

    await uploadFiles({ src: './src', dest: 'hubspot/dest' });

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to upload'));
  });

  test('recursively uploads files from subdirectories', async () => {
    mockReaddirSync
      .mockReturnValueOnce(['assets', 'index.js'])
      .mockReturnValueOnce(['logo.png']);
    mockStatSync
      .mockReturnValueOnce({ isDirectory: () => true })
      .mockReturnValue({ isDirectory: () => false });

    await uploadFiles({ src: './src', dest: 'hubspot/dest' });

    expect(mockUpload).toHaveBeenCalledTimes(2);
  });
});
