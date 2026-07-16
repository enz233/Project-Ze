export interface ScreenPointerPoint {
  x: number;
  y: number;
}

export const POINT_MOVE_X_CALIBRATION_PX = 10;

export function calculatePointMoveTopLeft(
  screenPoint: ScreenPointerPoint,
  pointerOffset: ScreenPointerPoint
): ScreenPointerPoint {
  return {
    x: screenPoint.x - pointerOffset.x + POINT_MOVE_X_CALIBRATION_PX,
    y: screenPoint.y - pointerOffset.y,
  };
}
