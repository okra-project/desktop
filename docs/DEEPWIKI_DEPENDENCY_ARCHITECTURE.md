# Deep Wiki: OkraPDF Dependency & Build Architecture

This document explains the complex dependency management and build pipeline of OkraPDF Desktop, specifically addressing why the system is fragile and why issues like the "pdfjs-dist" confusion occur.

## 1. The Core Confusion: Two `package.json` Files

The project uses a **Two-Package Structure** standard in `electron-react-boilerplate`:

*   **Root `package.json`:** Contains **build-time** dependencies (Webpack, TypeScript, Electron Builder) and **renderer** dependencies (React, Redux). It is used for *development* (`npm start`).
*   **`release/app/package.json`:** Contains **runtime production** dependencies that must be physically present in the final app (Native modules, SDKs that can't be bundled).

### The Fragility
Webpack is configured to **bundle** everything in the root `node_modules` *except* what is listed in `release/app/package.json`.
*   **In Development:** Webpack runs from the root. It sees the root `node_modules`.
*   **In Production:** Webpack bundles the code, but `electron-builder` *also* installs the `release/app` dependencies into a fresh `node_modules` folder inside the app.

**Key Issue:** If a dependency is needed at runtime (like `pdfjs-dist`'s worker file) but is NOT in `release/app/package.json`, Webpack *must* bundle it perfectly. If Webpack fails to bundle a dynamic asset (like the worker), the app breaks because the file physically doesn't exist in the final build.

## 2. The `pdfjs-dist` Anomaly

`pdfjs-dist` version 5.x is pure ESM and highly sensitive to how it is loaded.

*   **Root `package.json`:** Pins `pdfjs-dist` to `5.4.530` via `overrides` to force `react-pdf` to use this version.
*   **`release/app/package.json`:** Does **NOT** list `pdfjs-dist`.
*   **The Workaround (`scripts/beforeBuild.js`):**
    Because `pdfjs-dist` is not in `release/app`, `electron-builder` would normally ignore it. To fix this, `scripts/beforeBuild.js` **manually copies** the entire `pdfjs-dist` folder from the root `node_modules` into `release/app/node_modules` before packaging.

```javascript
// scripts/beforeBuild.js
const sdkDeps = [ ..., 'pdfjs-dist' ]; // Manually listed!
for (const depName of sdkDeps) {
  copyDependency(depName, false);
}
```

**Why this is confusing:**
1.  **Dev vs Prod:** in Dev, you rely on Webpack serving the file. In Prod, you rely on this script copying the file.
2.  **Webpack Externals:** `webpack.config.base.ts` treats dependencies in `release/app/package.json` as "externals" (not bundled). But `pdfjs-dist` is *not* there, so Webpack *tries* to bundle it.
3.  **The Fix:** We had to manually tell Webpack (via `asset/resource`) to treat the worker file as a static asset, effectively "bundling" it by copying the file to the output directory.

## 3. The Dependency Chain

*   **`react-pdf` (10.3.0):** The UI component. It expects `pdfjs-dist` 4.x.
*   **`pdfjs-dist` (5.4.530):** The actual PDF engine. Pinned to 5.x.
*   **`package.json` Overrides:**
    ```json
    "overrides": {
      "react-pdf": { "pdfjs-dist": "$pdfjs-dist" } // Forces react-pdf to use root's 5.4.530
    }
    ```
    This aggressive override is risky. `react-pdf` may call APIs that changed in 5.x, causing silent failures or type errors.

## 4. Native Modules (general)

Native modules cannot be bundled by Webpack because they are binary (`.node`) files.
*   They **MUST** be in `release/app/package.json`.
*   They are installed by `electron-builder` during packaging.
*   `webpack.config.base.ts` automatically marks them as `externals` so Webpack usually ignores them.
*   `@napi-rs/canvas` was removed once PDF rendering moved to the renderer worker.

**The "Chokidar" Bug:**
The commit `085adc0` added `chokidar` to `release/app/package.json`.
*   **Why?** `chokidar` was likely being used in the *main process* for file watching.
*   **The Error:** If it wasn't in `release/app`, Webpack tried to bundle it. But `chokidar` uses native `fsevents` (on macOS). Webpack often fails to bundle native optional dependencies correctly.
*   **The Fix:** Adding it to `release/app` told Webpack "don't bundle this, it will be there at runtime".

## 5. Summary of Fragility

The system relies on three distinct mechanisms aligning perfectly:
1.  **Webpack** bundling correctly for Dev.
2.  **`beforeBuild.js`** copying correctly for Prod (for things like `pdfjs-dist`).
3.  **`release/app/package.json`** installing correctly for Prod (for Native modules).

**Recommendation:**
*   **Development:** Ensure Webpack `devServer` serves static assets (`assets/` folder) so manual file references work.
*   **Production:** Keep `beforeBuild.js` as the "source of truth" for copying tricky dependencies like `pdfjs-dist` that don't fit the standard "native module" bucket.

## 6. Known Issues & Workarounds

### Node Canvas Crash ("Value is non of these types")

**Symptoms:**
App crashes or extraction fails with the error:
`Error: Value is non of these types 'String', 'Path'`

**Cause:**
This is a Rust error from the `napi-rs` binding for `canvas`. It occurs when `pdfjs-dist` (running in Node.js) attempts to render text. PDF.js assumes permissive browser canvas behavior, but `@napi-rs/canvas` is strict and panics on invalid types.

**The Fix (Consistent Dev/Packaged Path):**
All PDF.js rendering and text extraction now run inside a hidden renderer window (`pdf-worker.html`) that uses Chromium's real Canvas:
1.  **Renderer Worker (`src/renderer/pdf-worker.ts`):**
    *   Loads `pdfjs-dist` in a browser context.
    *   Renders pages to HTML5 Canvas and returns Base64 PNG data.
    *   Extracts text via `getTextContent` without Node polyfills.
2.  **Main Process Client (`src/main/services/pdf-worker.service.ts`):**
    *   Creates and manages the hidden worker window.
    *   Sends requests over IPC and returns results to main handlers.
3.  **Main Handlers:**
    *   OCR, table extraction, and text extraction now call the worker.
    *   No `@napi-rs/canvas`, no `Path2D`/`DOMMatrix` polyfills.

This removes the Node canvas surface area entirely, so dev and packaged builds use the same Chromium rendering behavior.
