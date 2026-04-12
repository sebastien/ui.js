# Agent Guidelines for ui.js

## Build & Toolchain
- **Commands**: This repository uses a `Makefile` based on LittleSDK conventions.
  - `make test` runs all tests (powered by `bun test`).
  - `make check` runs the linter (Biome).
  - `make fix` auto-formats code and fixes lint errors.
  - `make build` creates build artifacts.
- **No-Build Core**: The core library runs natively in the browser via ESM without requiring a build step.

## Architecture
- **Purpose**: `ui.js` is a lightweight, granular rendering UI library.
- **Key Modules**:
  - `src/js/ui.js` - Main entrypoint exposing all public APIs (`render`, `h`, `$`, `webcomponent`).
  - `src/js/ui/cells.js` - Reactive state primitives.
  - `src/js/ui/hyperscript.js` - Virtual DOM and hyperscript builders.
  - `src/js/ui/effectors.js` - DOM mutations and lifecycle management.
  - `src/js/ui/vdom.js` - Virtual DOM diffing.

## Testing Quirks
- **Test Runner**: Uses `bun:test` (e.g., `import { test, expect } from "bun:test"`).
- **DOM Mocking**: Since tests run in Bun, the DOM is mocked using a custom `domish` library.
- **Setup**: Tests should either import `domish.install()` from `../deps/domish/src/ts/domish/domish.ts` or use the helpers in `tests/test-utils.ts` to mount components.

## Conventions
- **Zero Dependencies**: Minimize external dependencies in `src/` to keep the library "dead simple".
- **ESM Native**: Write standard ECMAScript Modules (`.js`). Types are handled separately or via JSDoc/inline types.

## Important
- DO NOT use version control, let the user manage commits
- DO NOT start a web server, ask the user to run one for you
- This is a high-performance library, ensure there's no regression (`bun run bench:inspector`) and minimise memory footprint.
