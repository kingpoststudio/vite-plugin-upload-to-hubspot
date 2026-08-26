/// <reference types="@types/bun" />
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import {
  DEFAULT_ATTEMPTS,
  DEFAULT_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  pool,
  shouldExclude,
  uploadQueuedFiles,
} from './queue';

const mockStatSync = mock(() => ({ isDirectory: () => false, size: 1 }));
const mockUpload = mock(() => Promise.resolve());
const mockUploadFile = mock(() => Promise.resolve());
const mockUpdateHttpTimeout = mock(() => { });
const mockLogger = {
  log: mock(() => { }),
  info: mock(() => { }),
  warn: mock(() => { }),
  success: mock(() => { }),
  error: mock(() => { }),
};

mock.module('node:fs', () => ({
  readdirSync: mock(() => []),
  statSync: mockStatSync,
  existsSync: mock(() => true),
}));

mock.module('@hubspot/local-dev-lib/api/fileMapper', () => ({
  upload: mockUpload,
}));

mock.module('@hubspot/local-dev-lib/api/fileManager', () => ({
  uploadFile: mockUploadFile,
}));

mock.module('@hubspot/local-dev-lib/config', () => ({
  loadConfig: mock(() => { }),
  getAccountId: mock(() => '12345'),
  updateHttpTimeout: mockUpdateHttpTimeout,
}));

describe('defaults', () => {
  test('are backwards-compatible values projects can rely on without config', () => {
    expect(DEFAULT_CONCURRENCY).toBe(5);
    expect(DEFAULT_ATTEMPTS).toBe(4);
    expect(DEFAULT_TIMEOUT_MS).toBe(60_000);
  });
});

describe('shouldExclude', () => {
  test('matches extension patterns and substrings', () => {
    expect(shouldExclude('src/main.ts', ['.ts'])).toBe(true);
    expect(shouldExclude('src/main.js', ['.ts'])).toBe(false);
    expect(shouldExclude('build/chunk-abc.js', ['chunk'])).toBe(true);
  });
});

describe('pool', () => {
  test('never runs more workers than concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3, 4, 5, 6];

    await pool(items, 2, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight--;
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBe(2);
  });

  test('handles an empty list', async () => {
    const worker = mock(() => Promise.resolve());
    await pool([], 5, worker);
    expect(worker).not.toHaveBeenCalled();
  });
});

describe('uploadQueuedFiles', () => {
  beforeEach(() => {
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

  test('caps in-flight CMS uploads at concurrency', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    mockUpload.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 40));
      inFlight--;
    });

    await uploadQueuedFiles({
      files: ['/tmp/a.js', '/tmp/b.js', '/tmp/c.js', '/tmp/d.js', '/tmp/e.js', '/tmp/f.js'],
      srcDir: '/tmp',
      dest: 'Theme',
      accountId: 12345,
      logger: mockLogger,
      concurrency: 2,
      attempts: 1,
    });

    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(mockUpload).toHaveBeenCalledTimes(6);
  });

  test('uploads smallest files first', async () => {
    mockStatSync.mockImplementation((filepath: string) => ({
      isDirectory: () => false,
      size: String(filepath).includes('large') ? 1000 : 10,
    }));

    const order: string[] = [];
    mockUpload.mockImplementation(async (_id: unknown, src: string) => {
      order.push(src);
    });

    await uploadQueuedFiles({
      files: ['/tmp/large.js', '/tmp/small.js'],
      srcDir: '/tmp',
      dest: 'Theme',
      accountId: 12345,
      logger: mockLogger,
      concurrency: 1,
      attempts: 1,
    });

    expect(order[0]).toContain('small.js');
    expect(order[1]).toContain('large.js');
  });

  test('retries then succeeds', async () => {
    mockUpload
      .mockRejectedValueOnce(new Error('The post in account 12345 failed'))
      .mockResolvedValueOnce(undefined);

    await uploadQueuedFiles({
      files: ['/tmp/main.js'],
      srcDir: '/tmp',
      dest: 'Theme',
      accountId: 12345,
      logger: mockLogger,
      attempts: 3,
    });

    expect(mockUpload).toHaveBeenCalledTimes(2);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Retrying'));
    expect(mockLogger.success).toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('passes timeout to filemapper and updateHttpTimeout', async () => {
    await uploadQueuedFiles({
      files: ['/tmp/main.js'],
      srcDir: '/tmp',
      dest: 'Theme',
      accountId: 12345,
      logger: mockLogger,
      timeout: 45_000,
      attempts: 1,
    });

    expect(mockUpdateHttpTimeout).toHaveBeenCalledWith('45000');
    expect(mockUpload).toHaveBeenCalledWith(
      12345,
      '/tmp/main.js',
      expect.stringContaining('Theme'),
      { timeout: 45_000 },
    );
  });

  test('uses default timeout when none is provided', async () => {
    await uploadQueuedFiles({
      files: ['/tmp/main.js'],
      srcDir: '/tmp',
      dest: 'Theme',
      accountId: 12345,
      logger: mockLogger,
      attempts: 1,
    });

    expect(mockUpdateHttpTimeout).toHaveBeenCalledWith(String(DEFAULT_TIMEOUT_MS));
    expect(mockUpload).toHaveBeenCalledWith(
      12345,
      expect.any(String),
      expect.any(String),
      { timeout: DEFAULT_TIMEOUT_MS },
    );
  });
});
