import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface AppearanceConfig {
  petSize: number;   // 100~300, 默认 200
  opacity: number;   // 0.3~1.0, 默认 1.0
}

const DEFAULT_CONFIG: AppearanceConfig = {
  petSize: 200,
  opacity: 1.0,
};

export class AppearanceConfigManager {
  private configPath: string;
  private config: AppearanceConfig;

  constructor() {
    const configDir = path.join(app.getPath('userData'), 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    this.configPath = path.join(configDir, 'appearance.json');
    this.config = this.load();
  }

  private load(): AppearanceConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.error('[AppearanceConfig] 加载失败:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (e) {
      console.error('[AppearanceConfig] 保存失败:', e);
    }
  }

  get(): AppearanceConfig {
    return this.config;
  }

  update(partial: Partial<AppearanceConfig>): void {
    this.config = { ...this.config, ...partial };
    this.save();
  }
}
