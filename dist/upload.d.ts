export type UploadOptions = {
    /** Source directory to upload from. */
    src: string;
    /** Destination path on HubSpot. */
    dest: string;
    /** Account name or ID from hubspot.config.yml. */
    account?: string;
    /** File manager upload config for assets. */
    assets?: {
        src: string;
        dest: string;
    };
    /** Glob patterns or extensions to exclude (e.g. ['.ts']). Matched against relative file paths. */
    exclude?: string[];
    /** Path to hubspot.config.yml. Defaults to "hubspot.config.yml". */
    configPath?: string;
    /** Max parallel CMS uploads. Default 5. */
    concurrency?: number;
    /** Attempts per file, including the first try. Default 4. */
    attempts?: number;
    /** Per-request timeout in ms. Default 60000. */
    timeout?: number;
};
/**
 * Standalone upload function — uploads files from a local directory to HubSpot.
 * Can be used without Vite.
 */
export declare function uploadFiles(options: UploadOptions): Promise<void>;
