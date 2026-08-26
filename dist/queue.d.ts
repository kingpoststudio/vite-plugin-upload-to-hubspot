/** HubSpot CMS filemapper default timeout is 15s; large JS/PNG bodies need more. */
export declare const DEFAULT_TIMEOUT_MS = 60000;
/** Official `hs cms upload` queues at 10; 5 leaves headroom for large bodies. */
export declare const DEFAULT_CONCURRENCY = 5;
export declare const DEFAULT_ATTEMPTS = 4;
export type UploadLogger = {
    log: (msg: string) => void;
    info: (msg: string) => void;
    warn: (msg: string) => void;
    success: (msg: string) => void;
    error: (msg: string) => void;
};
export declare function normalizePath(p: string): string;
export declare function getAllFiles(dirPath: string): string[];
export declare function shouldExclude(relativePath: string, exclude: string[]): boolean;
export declare function pool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void>;
export declare function uploadQueuedFiles(options: {
    files: string[];
    srcDir: string;
    dest: string;
    accountId: number;
    logger: UploadLogger;
    assets?: {
        src: string;
        dest: string;
    };
    exclude?: string[];
    concurrency?: number;
    attempts?: number;
    timeout?: number;
}): Promise<void>;
