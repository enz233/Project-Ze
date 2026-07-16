export type ScreenVisionPurpose = 'screen-analysis' | 'target-locate' | string;
export type ScreenVisionImageDetail = 'low' | 'high';

export function getScreenVisionImageDetail(purpose: ScreenVisionPurpose): ScreenVisionImageDetail {
  return purpose === 'target-locate' ? 'high' : 'low';
}
