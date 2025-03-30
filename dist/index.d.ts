type Options = {
    src: string;
    dest: string;
    account?: string;
    assetSrc?: string;
};
export default function uploadToHubSpot(options: Options): {
    name: string;
    configResolved(): void;
    closeBundle(): Promise<void>;
};
export {};
