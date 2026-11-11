# Penpot Import for Figma

[![CI](https://github.com/mohammadraufzahed/penpot-to-figma/actions/workflows/ci.yml/badge.svg)](https://github.com/mohammadraufzahed/penpot-to-figma/actions/workflows/ci.yml)
[![Release](https://github.com/mohammadraufzahed/penpot-to-figma/actions/workflows/release.yml/badge.svg)](https://github.com/mohammadraufzahed/penpot-to-figma/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Import [Penpot](https://penpot.app) `.penpot` files into Figma — fully client-side, no Penpot account or server required.

> The `.penpot` file is parsed entirely in your browser/Figma session. Nothing is uploaded anywhere.

## Features

| Area | What's imported |
| --- | --- |
| **Structure** | Pages, frames, groups, nesting, constraints, opacity, blend modes |
| **Primitives** | Rectangles (per-corner radius), ellipses, paths (editable vectors), booleans & raw SVG (via SVG), images (PNG/JPG/GIF, WebP auto-converted) |
| **Paints** | Solid, linear & radial gradients (coordinate-mapped), image fills, strokes (width/alignment/cap/dash) |
| **Effects** | Drop & inner shadows, layer & background blur |
| **Text** | Styled runs: font family/size/weight/style, letter spacing, line height, text case, decoration, alignment, auto-resize |
| **Libraries** | Color styles, text styles, design tokens → Figma variables (with alias resolution) |
| **Components** | Penpot components & instances |
| **Prototype** | Navigate, open URL, overlays; dissolve / slide / push transitions |

## Install

### From a release (recommended)

1. Download the latest `penpot-to-figma-<version>.zip` from [Releases](https://github.com/mohammadraufzahed/penpot-to-figma/releases).
2. Unzip it — you get `manifest.json` and `dist/`.
3. In Figma desktop: **Plugins → Development → Import plugin from manifest…** and select the unzipped `manifest.json`.

### From source

```bash
git clone https://github.com/mohammadraufzahed/penpot-to-figma.git
cd penpot-to-figma
npm install
npm run build
```

Then **Plugins → Development → Import plugin from manifest…** → select `manifest.json` in the repo.

## Usage

1. In Penpot, export/download your file as `.penpot`.
2. Open the **Penpot Import** plugin in Figma.
3. Drop the `.penpot` file onto the plugin UI (or click to browse).
4. Choose options (pages, libraries, prototype) and click **Import**.
5. Review any warnings listed in the UI — they explain approximations (e.g. missing fonts, flattened booleans).

## Development

```bash
npm install
npm run build      # production build (vite UI + esbuild sandbox)
npm run typecheck  # strict TypeScript check
npm test           # vitest unit tests
npm run verify:dist # sanity-check built artifacts against manifest.json
```

### Project layout

```
src/
  ui/        Plugin UI iframe (drag & drop, WebP→PNG, progress, warnings)
  sandbox/   Figma plugin runtime (node creation, paints, text, libraries, prototype)
  shared/    Penpot format types, parser, pure converters (unit-tested)
tests/       Vitest suites (parser fixtures + converters)
scripts/     Build helpers (sandbox bundle with inlined UI, dist verification)
```

### Architecture

1. **UI iframe** reads the `.penpot` ZIP with JSZip, parses manifest/pages/shapes/media/tokens, converts WebP images to PNG (Figma can't ingest WebP), and posts the document to the sandbox via `postMessage`.
2. **Sandbox** (no DOM access) builds the Figma node tree: images → variables/styles/components → pages and shapes → prototype reactions.
3. **Shared converters** are pure functions (colors, matrices, path segments, gradient transforms, text runs, tokens) covered by unit tests.

## Testing

- `npm test` — parser fixture (hand-built `.penpot` ZIP) + converter units (gradient math, matrix algebra, path encoding, text parsing, token aliases).
- `npm run typecheck` — strict `tsc --noEmit`.
- `npm run build && npm run verify:dist` — ensures `dist/code.js` + `dist/index.html` exist and match `manifest.json`.
- CI runs all of the above on every PR ([ci.yml](.github/workflows/ci.yml)).

## Releases & CI/CD

- **CI** ([ci.yml](.github/workflows/ci.yml)): typecheck → test → build → dist verification on every push to `main` and every PR.
- **Release** ([release.yml](.github/workflows/release.yml)): push a tag `v*.*.*` (or run manually) to build, test, and publish a GitHub release with `penpot-to-figma-<version>.zip` containing `manifest.json` + `dist/`.

```bash
git tag v0.1.0 && git push origin v0.1.0   # triggers the release workflow
```

## Limitations

- **Booleans** are imported as SVG approximations (flattened, not editable boolean ops).
- **Radial gradients** use an approximation of Penpot's gradient coordinate model.
- **Grid layouts** and **per-side strokes** are best-effort.
- **Fonts** depend on what's available in Figma; missing fonts fall back to Inter with a warning.
- **Images** larger than Figma's limits or in unsupported formats are skipped with a warning.

## License

MIT — see [LICENSE](LICENSE).
