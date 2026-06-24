# Screen Translate

Windows-first desktop screenshot translation client built with Electron, React, and TypeScript.

## Current MVP

- Tray app with settings window.
- Default global shortcut: `Ctrl+Alt+T`.
- Region selection overlay.
- Native screen capture and crop through Electron.
- OpenAI-compatible model adapter using `/chat/completions`.
- Structured translation JSON parsing and validation.
- Result overlay with translated text blocks, original view, text view, copy, retry, and close.
- API key storage through Electron `safeStorage`.
- History disabled by default; optional local screenshot and JSON history.

## Run

```bash
npm install
npm run dev
```

## Validate

```bash
npm run typecheck
npm test
npm run build
```

## Notes

The app can run without an API key. In that case, it falls back to mock translated blocks so the desktop flow can still be tested. Configure `Base URL`, `API Key`, and `Model` in settings to use a real OpenAI-compatible multimodal model.

The first implementation targets Windows. Multi-monitor and high-DPI handling are started, but should be tested on real hardware before packaging.
