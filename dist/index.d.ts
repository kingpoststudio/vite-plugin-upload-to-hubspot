import type { Plugin } from 'vite';
type Options = {
    src: string;
    dest: string;
    account?: string;
    exclude?: string[];
    assets?: {
        src: string;
        dest: string;
    };
    concurrency?: number;
    attempts?: number;
    timeout?: number;
};
export default function uploadToHubSpot(options: Options): Plugin;
export {};
