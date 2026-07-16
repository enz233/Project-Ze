import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { CameraAwarenessConfig } from './camera-awareness-types';

const LEGACY_FOREGROUND_FACE_MIN_HEIGHT_RATIO = 0.14;
const LEGACY_FOREGROUND_FACE_MIN_AREA_RATIO = 0.012;
const PREVIOUS_FOREGROUND_FACE_MIN_HEIGHT_RATIO = 0.07;
const PREVIOUS_FOREGROUND_FACE_MIN_AREA_RATIO = 0.0025;

export const DEFAULT_CAMERA_AWARENESS_CONFIG: CameraAwarenessConfig = {
  enabled: false,
  backgroundDetectionEnabled: false,
  lightAffectEnabled: true,
  detectionIntervalMs: 60 * 1000,
  absentAfterMs: 120 * 1000,
  minConfidence: 0.65,
  foregroundFaceGateEnabled: true,
  foregroundFaceMinHeightRatio: 0.05,
  foregroundFaceMinAreaRatio: 0.0012,
  returnedReactionEnabled: true,
  debugPreviewEnabled: false,
};

export class CameraAwarenessConfigManager {
  private configPath: string;
  private config: CameraAwarenessConfig;

  constructor() {
    const configDir = path.join(app.getPath('userData'), 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    this.configPath = path.join(configDir, 'camera-awareness.json');
    this.config = this.load();
  }

  get(): CameraAwarenessConfig {
    return this.config;
  }

  update(partial: Partial<CameraAwarenessConfig>): void {
    this.config = { ...this.config, ...this.normalize(partial) };
    this.save();
  }

  save(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      console.error('[CameraAwarenessConfig] 保存配置失败:', error);
    }
  }

  private load(): CameraAwarenessConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_CAMERA_AWARENESS_CONFIG, ...this.normalize(this.migrate(JSON.parse(raw))) };
      }
    } catch (error) {
      console.error('[CameraAwarenessConfig] 加载配置失败:', error);
    }
    return { ...DEFAULT_CAMERA_AWARENESS_CONFIG };
  }

  private migrate(partial: Partial<CameraAwarenessConfig>): Partial<CameraAwarenessConfig> {
    const migrated = { ...partial };

    // 旧默认阈值会把示例画面中最大的前景人脸拦掉；保留用户自定义值，只迁移旧默认值。
    if (
      migrated.foregroundFaceMinHeightRatio === LEGACY_FOREGROUND_FACE_MIN_HEIGHT_RATIO ||
      migrated.foregroundFaceMinHeightRatio === PREVIOUS_FOREGROUND_FACE_MIN_HEIGHT_RATIO
    ) {
      delete migrated.foregroundFaceMinHeightRatio;
    }
    if (
      migrated.foregroundFaceMinAreaRatio === LEGACY_FOREGROUND_FACE_MIN_AREA_RATIO ||
      migrated.foregroundFaceMinAreaRatio === PREVIOUS_FOREGROUND_FACE_MIN_AREA_RATIO
    ) {
      delete migrated.foregroundFaceMinAreaRatio;
    }

    return migrated;
  }

  private normalize(partial: Partial<CameraAwarenessConfig>): Partial<CameraAwarenessConfig> {
    const normalized = { ...partial };

    if (typeof normalized.detectionIntervalMs === 'number') {
      normalized.detectionIntervalMs = Math.max(30 * 1000, Math.min(5 * 60 * 1000, normalized.detectionIntervalMs));
    }
    if (typeof normalized.absentAfterMs === 'number') {
      normalized.absentAfterMs = Math.max(60 * 1000, Math.min(5 * 60 * 1000, normalized.absentAfterMs));
    }
    if (typeof normalized.minConfidence === 'number') {
      normalized.minConfidence = Math.max(0, Math.min(1, normalized.minConfidence));
    }
    if (typeof normalized.foregroundFaceMinHeightRatio === 'number') {
      normalized.foregroundFaceMinHeightRatio = Math.max(0.02, Math.min(0.8, normalized.foregroundFaceMinHeightRatio));
    }
    if (typeof normalized.foregroundFaceMinAreaRatio === 'number') {
      normalized.foregroundFaceMinAreaRatio = Math.max(0.001, Math.min(0.5, normalized.foregroundFaceMinAreaRatio));
    }

    return normalized;
  }
}
