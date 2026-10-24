# Repository Guidelines

## Project Structure & Module Organization

Sideboard Printer is a static browser app for turning spreadsheet sideboard guides into printable cards. There is no build step or npm package installation.

- `index.html` and `style.css` define the interface and styling.
- `app.js` handles browser interactions, spreadsheet loading, saved settings, and sharing.
- `guide.js` parses CSV/TSV data and generates card layouts and SVG previews.
- `pdf.js` creates printable PDF downloads.
- `guide.test.js` and `pdf.test.js` contain automated checks alongside the source.
- `img/` holds documentation images; `scripts/example-image.js` regenerates the example.
- `web/index.html` redirects legacy links to the root app, preserving query parameters and fragments.

## Build, Test, and Development Commands

- `just server`: serve the repository at `http://localhost:8000/` without browser caching.
- `just test`: run both test files with Node's built-in runner.
- `node guide.test.js` or `node pdf.test.js`: run one test file directly.
- `node scripts/example-image.js`: regenerate `img/example_guide.png`; requires `rsvg-convert` from librsvg.

## Coding Style & Naming Conventions

Match the existing plain JavaScript: two-space indentation, semicolons, single-quoted strings, camelCase functions and variables, and uppercase constants such as `EXAMPLE_SHEET`. Keep parsing and rendering logic separate from browser interaction code. Use the existing CSS variables for visual consistency. No formatter or linter configuration is currently checked in. Prefer clear names over explanatory comments; reserve comments for non-obvious constraints.

## Testing Guidelines

Tests use Node's built-in `assert` modules and `*.test.js` filenames. Add focused assertions for changed parsing, layout, or PDF behavior; no coverage threshold is configured. Run `just test` before committing. For interface changes, also check the browser preview, shared links, and PDF output as relevant. Preserve the 63 × 88 mm card dimensions.

## Commit & Pull Request Guidelines

Use plain, imperative commit descriptions. Keep commits focused and commit each completed, tested unit. Do not push or open a pull request unless asked; requested pull requests should be drafts. Describe meaningful user-visible changes in short bullets, link relevant issues, and include screenshots for visual changes.

## Privacy

Keep guide processing in the browser. Do not introduce uploads or analytics that expose spreadsheet contents or shared guide data.
