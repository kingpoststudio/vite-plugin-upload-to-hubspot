# Vite Plugin: Upload to HubSpot

This Vite plugin uploads files from a specified source directory to a HubSpot account after the build process is complete.
It uses the HubSpot Local Development Library to handle the file uploads.

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
        "modules/ContentCarousel.module/module": resolve(
          __dirname,
          "src/modules/ContentCarousel.module/module.ts"
        ),
        "modules/HeroCarousel.module/module": resolve(
          __dirname,
          "src/modules/HeroCarousel.module/module.ts"
        ),
        "modules/globals/Footer.module/module": resolve(
          __dirname,
          "src/modules/globals/Footer.module/module.ts"
        ),
        "modules/globals/Header.module/module": resolve(
          __dirname,
          "src/modules/globals/Header.module/module.ts"
        ),
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
      dest: "Theme",
      account: "develop",
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
