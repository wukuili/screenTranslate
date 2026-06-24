# Screen Translate Desktop Client Design

Date: 2026-06-24

## Goal

Build a Windows-first desktop client similar to Youdao's photo translation experience. The user presses a global shortcut, selects a screen region, and the app uses an OpenAI-compatible multimodal model to recognize and translate the screenshot. The first version should render translated text back over the source text area whenever possible, while keeping reliable fallback modes for difficult screenshots.

The first implementation targets Windows, with platform boundaries kept explicit so macOS and Linux support can be added later.

## Confirmed Product Decisions

- Primary interaction: global shortcut screenshot translation.
- First platform: Windows implementation, with cross-platform adapters reserved in the architecture.
- Model interface: OpenAI-compatible API with configurable `Base URL`, `API Key`, and `Model`.
- Result display: intelligent redraw over the original text area.
- Language behavior: auto-detect source language, translate to the configured target language. Default target language is Chinese.
- History behavior: off by default. Users can enable local history in settings.
- Technology route: Electron, React, and TypeScript.

## Architecture

### Main Process

The Electron main process owns desktop integration and privileged operations:

- Global shortcut registration.
- Tray menu lifecycle.
- Window creation and cleanup.
- Secure configuration access.
- Screenshot capture coordination.
- Model API calls.
- History persistence.
- IPC boundaries between privileged code and renderer UI.

### Platform Adapter

Desktop-specific behavior should sit behind platform adapters. The first adapter is Windows-focused, but the interface should avoid hardcoding Windows assumptions into the translation pipeline.

Responsibilities:

- Screen capture support.
- Multi-monitor geometry.
- DPI scaling conversion.
- Shortcut registration behavior.
- Optional startup integration in later versions.

### Capture Overlay

The capture overlay is a transparent full-screen window used for selecting a screen region. It must support:

- Region selection with mouse drag.
- Cancel with `Esc`.
- Multi-monitor geometry where practical.
- High-DPI coordinate conversion.
- Returning the selected bitmap plus its absolute screen coordinates.

### Translation Pipeline

The pipeline receives a screenshot image and target language, then calls the configured OpenAI-compatible model. It asks the model for structured JSON containing source text, translated text, bounding boxes, and rendering hints.

Expected result shape:

```json
{
  "sourceLanguage": "en",
  "targetLanguage": "zh-CN",
  "blocks": [
    {
      "sourceText": "Example text",
      "translatedText": "示例文本",
      "bbox": { "x": 120, "y": 80, "width": 220, "height": 42 },
      "fontHint": { "size": 16, "weight": "normal", "color": "#111111" },
      "backgroundHint": { "color": "#ffffff", "opacity": 0.92 },
      "confidence": 0.86
    }
  ]
}
```

The pipeline should validate model output before rendering. Invalid or partial output must not crash the app.

### Result Overlay

The result overlay is a transparent always-on-top window positioned over the selected screen area. It renders translated text over the original source text positions.

Core actions:

- Close overlay.
- Copy all translated text.
- Retry translation.
- Switch display mode between translated overlay, original screenshot, and text panel.

## Intelligent Redraw Strategy

The first version uses a pragmatic redraw strategy:

1. For each detected text block, draw a background mask over the source text bounding box.
2. Use model-provided background hints when available.
3. If background hints are weak, use a semi-transparent white or black mask chosen for contrast.
4. Render translated text inside the bounding box.
5. Adjust font size, line height, and wrapping to fit the translated text.
6. Allow the translated text box to expand slightly when needed, but keep it inside the captured region.
7. Preserve reading order so copy-to-clipboard output is natural.

This is not full image inpainting. It is an overlay-based redraw that should look close to image translation while remaining practical for a first release.

## Fallback Behavior

Fallbacks are required because model output can be incomplete or inaccurate.

- If a block has low confidence, show the translation near the source text instead of masking aggressively.
- If bounding boxes are missing or invalid, show a text panel with original and translated text.
- If JSON parsing fails, retry once with a stricter repair prompt. If repair fails, show the text panel.
- If API calls fail, show an actionable error with retry and settings shortcuts.
- If DPI or multi-monitor geometry causes unreliable positioning, show the text panel rather than a misleading overlay.

## Settings

The settings window is the main user-facing configuration surface.

Required settings:

- `Base URL`
- `API Key`
- `Model`
- Target language
- Request timeout
- Global shortcut
- Save history toggle
- Maximum history items when history is enabled
- Auto-copy translated text toggle

The settings window should include a test connection action that verifies the configured model endpoint.

## Privacy And Storage

Privacy defaults:

- Do not save screenshots by default.
- Do not save full translation history by default.
- Clearly state that screenshots are sent to the configured model service.
- Store API keys using OS-backed secure storage rather than plain JSON.

When history is enabled, store locally:

- Screenshot thumbnail or image.
- Structured translation JSON.
- Target language.
- Timestamp.

The user must be able to clear history from settings.

## Tray Menu

The app should run from the tray after launch.

Tray actions:

- Screenshot translate.
- Open settings.
- Pause or resume shortcut.
- Exit.

## MVP Acceptance Criteria

The first version is acceptable when:

1. The app starts on Windows and remains available from the tray.
2. `Ctrl + Alt + T` enters screenshot selection mode by default.
3. The user can select a screen region and send it to an OpenAI-compatible model.
4. The user can configure `Base URL`, `API Key`, `Model`, and target language.
5. Valid structured model output renders translated text over source text areas.
6. The result overlay supports close, copy all translated text, and retry.
7. Invalid model output falls back to a readable text panel.
8. Screenshots and history are not saved unless the user enables history.
9. API keys are not stored as ordinary plaintext JSON.
10. Single-screen Windows high-DPI usage works without crashing.
11. Multi-monitor or high-DPI coordinate issues degrade to a text panel rather than a broken overlay.

## Test Strategy

### Unit Tests

- Configuration read and write behavior.
- Secure credential storage wrapper behavior using mocks.
- OpenAI-compatible request builder.
- Model JSON parser and validator.
- Translation block layout calculation.
- History enabled and disabled behavior.

### Integration Tests

- Mock pipeline from screenshot input to parsed translation result.
- Mock model response rendering data for the result overlay.
- Settings update through IPC to main-process configuration.

### Manual Desktop Tests

- Single monitor screenshot selection.
- Multi-monitor screenshot selection.
- Different Windows scaling values.
- Shortcut conflict.
- Network failure.
- Invalid API key.
- Invalid model JSON.
- Complex webpage screenshot.
- Mixed-language screenshot.

### Visual Verification

Use fixed screenshot fixtures and mock model results to inspect:

- Background masks.
- Text wrapping.
- Font sizing.
- Overlay alignment.
- Text panel fallback.

## Non-Goals For First Version

- Full image inpainting or background reconstruction.
- Mobile apps.
- Offline local vision model support.
- Perfect preservation of original font style.
- Cloud account sync.
- Collaborative history.

## Implementation Notes

- Keep model calls behind a provider adapter so compatible APIs can vary in URL and request shape.
- Keep screenshot and coordinate handling behind a platform adapter.
- Treat model output as untrusted input and validate before rendering.
- Prefer simple, inspectable overlay rendering before adding complex image processing.
- Add richer OCR, image repair, and layout analysis only after the MVP workflow is reliable.
