# Vite Plugin: Upload to HubSpot

This Vite plugin uploads files from a specified source directory to a HubSpot account after the build process is complete. It uses the HubSpot Local Development Library to handle the file uploads.

## Installation

To install the plugin using Bun, run the following command:

```bash
bun add vite-plugin-upload-to-hubspot
```

## Usage

To use the plugin, import it and add it to your Vite configuration file.

#### Example Configuration

```javascript
import { defineConfig } from "vite";
import { resolve } from "node:path";
import uploadToHubSpot from "vite-plugin-upload-to-hubspot";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/js/main.ts"),
      },
      output: {
        format: "es",
        assetFileNames: ({ name }) =>
          name?.includes(".css")
            ? "build/css/[name][extname]"
            : "build/js/[name]-[hash][extname]",
        entryFileNames: ({ name }) =>
          name?.includes("module") ? "[name].js" : "build/js/[name].js",
        chunkFileNames: "build/js/[name]-[hash].js",
      },
    },
    minify: "esbuild",
    target: "es2020",
  },
  plugins: [
    uploadToHubSpot({
      src: "dist",
      dest: "ThemeName",
      account: "develop",
      assets: {
        src: "assets",
        dest: "ThemeName/assets",
      },
    }),
  ],
  resolve: {
    extensions: [".js", ".ts"],
  },
});
```

#### Options

- `src`: The source directory containing the files to upload.
- `dest`: The destination directory on the HubSpot account.
- `account`: The HubSpot account to upload the files to. This should match an account in your `hubspot.config.yml` file.
- `assets`: (Optional) An object specifying additional assets to upload. It contains:
  - `src`: The source directory for the assets.
  - `dest`: The destination directory for the assets on the HubSpot account.
- `exclude`: (Optional) File extensions or path substrings to skip (for example `['.ts', 'chunk']`).
- `concurrency`: (Optional) Max parallel uploads. Default `5`.
- `attempts`: (Optional) Tries per file, including the first. Default `4`.
- `timeout`: (Optional) Per-request timeout in milliseconds. Default `60000`.

Existing `{ src, dest, account }` configs keep working. The queue, retries, and longer timeout apply automatically.

The same options are available on the standalone `uploadFiles()` helper from `vite-plugin-upload-to-hubspot/upload`.

#### Features

- **Queued uploads**: Files are uploaded a few at a time (not all at once), so large JS/PNG bodies are less likely to hit HubSpot's request timeout.
- **Retries**: Transient failures (for example `The post in account … failed`) are retried with backoff.
- **Recursive Directory Processing**: The plugin scans the `src` directory recursively to find all files to upload, typically a build directory.
- **File Type Handling**: The plugin skips unsupported file types and logs a message for skipped files.
- **FieldsJS Processing**: Automatically detects and processes convertible FieldsJS files before uploading.
- **File Manager Support**: Allows uploading specific files to the HubSpot File Manager if the `assets` option is configured.
- **Error Handling**: Logs detailed error messages for failed uploads, including reasons for failure.
- **Success Logging**: Logs success messages for each file uploaded successfully.

## Releasing

Pushing a tag that matches `package.json` publishes to npm via [trusted publishing](https://docs.npmjs.com/trusted-publishers/). No `NPM_TOKEN` secret is required.

**One-time setup** from a logged-in npm CLI (skips the flaky package-settings page):

```bash
npm login
npx -y npm@latest trust github vite-plugin-upload-to-hubspot --file publish.yml --repository kingpoststudio/vite-plugin-upload-to-hubspot --allow-publish
```

If you prefer the website, open [the package access page](https://www.npmjs.com/package/vite-plugin-upload-to-hubspot/access) (not the public package page), add GitHub Actions, and use:

- Organization or user: `kingpoststudio`
- Repository: `vite-plugin-upload-to-hubspot`
- Workflow filename: `publish.yml`
- Allowed actions: `npm publish`

**Each release:**

1. Bump `version` in `package.json` and merge to `master`.
2. Tag that commit and push:

```bash
git tag v0.1.2
git push origin v0.1.2
```

Creating a GitHub Release with tag `v0.1.2` does the same thing. The tag must be `v` plus the exact `package.json` version, or the workflow fails before publishing.
