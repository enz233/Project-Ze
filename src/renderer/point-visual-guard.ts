export const POINT_SUCCESS_BUBBLE_HOLD_MS = 7000;

const POINT_SPRITE_PREFIX = 'point-';
const POINT_FALLBACK_SPRITE_PREFIX = 'dragged_';

export function shouldBlockSpriteDuringPointVisual(isPointVisualActive: boolean, spriteName: string): boolean {
  if (!isPointVisualActive) return false;
  if (spriteName.indexOf(POINT_SPRITE_PREFIX) === 0) return false;
  if (spriteName.indexOf(POINT_FALLBACK_SPRITE_PREFIX) === 0) return false;
  return true;
}
