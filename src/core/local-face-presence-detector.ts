export type LocalFacePresenceStatus = 'present' | 'absent' | 'uncertain' | 'unavailable';

export type LocalFacePresenceReason =
  | 'face_visible'
  | 'no_face_visible'
  | 'api_unavailable'
  | 'invalid_frame'
  | 'detector_error';

export type LocalFacePresenceSource =
  | 'shape-detection-api'
  | 'mediapipe-face-detector'
  | 'tfjs-face-detection'
  | 'tfjs-blazeface'
  | 'noop';

export interface LocalFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LocalFacePresenceResult {
  status: LocalFacePresenceStatus;
  confidence: number;
  faceCount: number;
  boxes: LocalFaceBox[];
  checkedAt: number;
  source: LocalFacePresenceSource;
  reason: LocalFacePresenceReason;
  error?: string;
}

export interface LocalFacePresenceDetector {
  readonly source: LocalFacePresenceSource;
  isAvailable(): Promise<boolean>;
  detect(frame: unknown): Promise<LocalFacePresenceResult>;
  dispose?(): void;
}

export interface LocalFacePresenceDetectorOptions {
  maxDetectedFaces?: number;
  fastMode?: boolean;
  now?: () => number;
  faceDetectorCtor?: ShapeDetectionFaceDetectorConstructor;
}

interface ShapeDetectionFaceDetectorConstructor {
  new (options?: { maxDetectedFaces?: number; fastMode?: boolean }): ShapeDetectionFaceDetector;
}

interface ShapeDetectionFaceDetector {
  detect(source: unknown): Promise<ShapeDetectionFace[]>;
}

interface ShapeDetectionFace {
  boundingBox?: DOMRectReadOnly | LocalFaceBox;
  landmarks?: unknown[];
}

const DEFAULT_MAX_DETECTED_FACES = 1;

/**
 * Local face-presence detector backed by the browser Shape Detection API.
 *
 * This module intentionally only answers "is a face visible?" It does not
 * identify people, persist frames, or infer sensitive attributes.
 */
export class ShapeDetectionFacePresenceDetector implements LocalFacePresenceDetector {
  readonly source: LocalFacePresenceSource = 'shape-detection-api';

  private detector: ShapeDetectionFaceDetector | null = null;
  private readonly maxDetectedFaces: number;
  private readonly fastMode: boolean;
  private readonly now: () => number;
  private readonly faceDetectorCtor?: ShapeDetectionFaceDetectorConstructor;

  constructor(options: LocalFacePresenceDetectorOptions = {}) {
    this.maxDetectedFaces = normalizeMaxDetectedFaces(options.maxDetectedFaces);
    this.fastMode = options.fastMode ?? true;
    this.now = options.now ?? (() => Date.now());
    this.faceDetectorCtor = options.faceDetectorCtor;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.getFaceDetectorConstructor());
  }

  async detect(frame: unknown): Promise<LocalFacePresenceResult> {
    if (!frame) {
      return this.result('unavailable', 0, [], 'invalid_frame');
    }

    const FaceDetectorCtor = this.getFaceDetectorConstructor();
    if (!FaceDetectorCtor) {
      return this.result('unavailable', 0, [], 'api_unavailable');
    }

    try {
      if (!this.detector) {
        this.detector = new FaceDetectorCtor({
          maxDetectedFaces: this.maxDetectedFaces,
          fastMode: this.fastMode,
        });
      }

      const faces = await this.detector.detect(frame);
      const boxes = faces.map(faceToBox).filter(Boolean) as LocalFaceBox[];
      if (boxes.length === 0) {
        return this.result('absent', 0, [], 'no_face_visible');
      }

      return this.result('present', 1, boxes.slice(0, this.maxDetectedFaces), 'face_visible');
    } catch (error: any) {
      return this.result('uncertain', 0, [], 'detector_error', error?.message || String(error));
    }
  }

  dispose(): void {
    this.detector = null;
  }

  private getFaceDetectorConstructor(): ShapeDetectionFaceDetectorConstructor | undefined {
    return this.faceDetectorCtor ?? (globalThis as any).FaceDetector;
  }

  private result(
    status: LocalFacePresenceStatus,
    confidence: number,
    boxes: LocalFaceBox[],
    reason: LocalFacePresenceReason,
    error?: string
  ): LocalFacePresenceResult {
    return {
      status,
      confidence,
      faceCount: boxes.length,
      boxes,
      checkedAt: this.now(),
      source: this.source,
      reason,
      error,
    };
  }
}

export class NoopFacePresenceDetector implements LocalFacePresenceDetector {
  readonly source: LocalFacePresenceSource = 'noop';

  constructor(private now: () => number = () => Date.now()) {}

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async detect(_frame: unknown): Promise<LocalFacePresenceResult> {
    return {
      status: 'unavailable',
      confidence: 0,
      faceCount: 0,
      boxes: [],
      checkedAt: this.now(),
      source: this.source,
      reason: 'api_unavailable',
    };
  }
}

export function createDefaultLocalFacePresenceDetector(
  options: LocalFacePresenceDetectorOptions = {}
): LocalFacePresenceDetector {
  const hasShapeDetector = Boolean(options.faceDetectorCtor ?? (globalThis as any).FaceDetector);
  if (hasShapeDetector) {
    return new ShapeDetectionFacePresenceDetector(options);
  }
  return new NoopFacePresenceDetector(options.now);
}

function normalizeMaxDetectedFaces(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_MAX_DETECTED_FACES;
  return Math.max(1, Math.min(8, Math.round(number)));
}

function faceToBox(face: ShapeDetectionFace): LocalFaceBox | null {
  const box = face.boundingBox;
  if (!box) return null;

  const x = Number((box as any).x);
  const y = Number((box as any).y);
  const width = Number((box as any).width);
  const height = Number((box as any).height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}
