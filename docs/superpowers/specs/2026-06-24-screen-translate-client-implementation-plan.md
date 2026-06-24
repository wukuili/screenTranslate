# Screen Translate Desktop Client Implementation Plan

Date: 2026-06-24

## Phase 1: Project Foundation

- Create an Electron + React + TypeScript app using Vite.
- Add main, preload, and renderer entry points.
- Add shared TypeScript types for settings, capture results, model output, and overlay blocks.
- Add scripts for development, build, type checking, linting, and tests.

## Phase 2: Desktop Shell

- Register a tray menu with screenshot translate, settings, pause shortcut, and exit actions.
- Register the default global shortcut `Ctrl+Alt+T`.
- Create the settings window.
- Create the capture overlay window.
- Create the result overlay window.

## Phase 3: Settings And Storage

- Store non-secret settings in a local JSON config file.
- Store API key through OS-backed secure storage.
- Provide IPC methods for reading, saving, and testing settings.
- Keep history disabled by default.

## Phase 4: Translation Pipeline

- Implement an OpenAI-compatible provider adapter.
- Send screenshot images as multimodal chat messages.
- Ask for strict JSON output with translated blocks and rendering hints.
- Validate and normalize model output.
- Add repair or fallback behavior for invalid JSON.

## Phase 5: Overlay Rendering

- Draw background masks over detected source text bounding boxes.
- Render translated text with fitting, wrapping, and contrast-aware defaults.
- Provide close, copy, retry, and view-mode actions.
- Fall back to a text panel when coordinates are unsafe.

## Phase 6: Verification

- Add unit tests for settings, parsing, layout calculation, and provider request building.
- Add a mock translation path so the UI can be verified without a live model.
- Manually test Windows launch, tray, shortcut, settings, capture overlay, and result overlay.

## First Implementation Slice

The first coding slice will build the scaffold plus a working mock mode:

1. App launches with tray and settings window.
2. Settings can be viewed and edited.
3. `Ctrl+Alt+T` opens a capture overlay.
4. A selected region creates a result overlay with mock translated blocks.
5. The overlay supports close and copy.

After that slice works, live model calls and secure key storage can be wired in.
