import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface JsonConfigStoreOptions<T extends object> {
  fileName: string;
  defaults: T;
  namespace: string;
  normalize?: (value: Partial<T>) => T;
}

export class JsonConfigStore<T extends object> {
  private configPath: string;
  private defaults: T;
  private namespace: string;
  private normalize: (value: Partial<T>) => T;
  private value: T;

  constructor(options: JsonConfigStoreOptions<T>) {
    this.defaults = options.defaults;
    this.namespace = options.namespace;
    this.normalize = options.normalize ?? ((value: Partial<T>) => ({ ...this.defaults, ...value }));

    const configDir = path.join(app.getPath('userData'), 'config');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    this.configPath = path.join(configDir, options.fileName);
    this.value = this.load();
  }

  get(): T {
    return this.value;
  }

  update(partial: Partial<T>): void {
    this.value = this.normalize({ ...this.value, ...partial });
    this.save();
  }

  save(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.value, null, 2), 'utf-8');
    } catch (e) {
      console.error(`[${this.namespace}] 保存失败:`, e);
    }
  }

  private load(): T {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        return this.normalize(JSON.parse(raw));
      }
    } catch (e) {
      console.error(`[${this.namespace}] 加载失败:`, e);
    }
    return this.normalize({});
  }
}
