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

#### Features

- **Recursive Directory Processing**: The plugin scans the `src` directory recursively to find all files to upload, typically a build directory.
- **File Type Handling**: The plugin skips unsupported file types and logs a message for skipped files.
- **FieldsJS Processing**: Automatically detects and processes convertible FieldsJS files before uploading.
- **File Manager Support**: Allows uploading specific files to the HubSpot File Manager if the `assets` option is configured.
- **Error Handling**: Logs detailed error messages for failed uploads, including reasons for failure.
- **Success Logging**: Logs success messages for each file uploaded successfully.
