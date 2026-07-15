export interface ScreenCaptureDisplaySize {
  width: number;
  height: number;
}

export const DEFAULT_SCREEN_CAPTURE_WIDTH = 1280;
export const DEFAULT_SCREEN_CAPTURE_HEIGHT = 720;

export function computeScreenCaptureThumbnailSize(displaySize: ScreenCaptureDisplaySize): ScreenCaptureDisplaySize {
  if (!Number.isFinite(displaySize.width) || !Number.isFinite(displaySize.height) || displaySize.width <= 0 || displaySize.height <= 0) {
    return { width: DEFAULT_SCREEN_CAPTURE_WIDTH, height: DEFAULT_SCREEN_CAPTURE_HEIGHT };
  }

  const width = DEFAULT_SCREEN_CAPTURE_WIDTH;
  const height = Math.max(1, Math.round(width * displaySize.height / displaySize.width));
  return { width, height };
}
