import { desktopCapturer, nativeImage, screen } from "electron";
import type { CaptureSelection } from "../shared/types";

export async function captureSelection(selection: CaptureSelection, displayId?: number): Promise<string> {
  const display =
    screen.getAllDisplays().find((candidate) => candidate.id === displayId) ??
    screen.getDisplayMatching(selection);
  const scaleFactor = display.scaleFactor || 1;
  const thumbnailSize = {
    width: Math.round(display.bounds.width * scaleFactor),
    height: Math.round(display.bounds.height * scaleFactor)
  };

  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize
  });

  const source =
    sources.find((candidate) => candidate.display_id === String(display.id)) ??
    sources.find((candidate) => candidate.name.toLowerCase().includes("screen")) ??
    sources[0];

  if (!source || source.thumbnail.isEmpty()) {
    throw new Error("Unable to capture the selected screen.");
  }

  const image = nativeImage.createFromBuffer(source.thumbnail.toPNG());
  const relativeSelection = {
    x: Math.max(0, Math.round((selection.x - display.bounds.x) * scaleFactor)),
    y: Math.max(0, Math.round((selection.y - display.bounds.y) * scaleFactor)),
    width: Math.max(1, Math.round(selection.width * scaleFactor)),
    height: Math.max(1, Math.round(selection.height * scaleFactor))
  };

  const imageSize = image.getSize();
  const cropRect = {
    ...relativeSelection,
    width: Math.min(relativeSelection.width, imageSize.width - relativeSelection.x),
    height: Math.min(relativeSelection.height, imageSize.height - relativeSelection.y)
  };

  if (cropRect.width <= 0 || cropRect.height <= 0) {
    throw new Error("Selected area is outside the captured screen.");
  }

  return image
    .crop(cropRect)
    .resize({
      width: Math.round(selection.width),
      height: Math.round(selection.height),
      quality: "best"
    })
    .toDataURL();
}
