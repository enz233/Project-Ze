import { JsonConfigStore } from './json-config-store';

export interface OperationGuideConfig {
  enabled: boolean;
  searchEnabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  lastTargetSoftware: string;
}

export const DEFAULT_OPERATION_GUIDE_CONFIG: OperationGuideConfig = {
  enabled: false,
  searchEnabled: false,
  baseUrl: '',
  apiKey: '',
  model: '',
  maxTokens: 4000,
  systemPrompt: '',
  lastTargetSoftware: '',
};

export function normalizeOperationGuideConfig(input: Partial<OperationGuideConfig>): OperationGuideConfig {
  return {
    enabled: toBoolean(input.enabled, DEFAULT_OPERATION_GUIDE_CONFIG.enabled),
    searchEnabled: toBoolean(input.searchEnabled, DEFAULT_OPERATION_GUIDE_CONFIG.searchEnabled),
    baseUrl: toStringValue(input.baseUrl, DEFAULT_OPERATION_GUIDE_CONFIG.baseUrl),
    apiKey: toStringValue(input.apiKey, DEFAULT_OPERATION_GUIDE_CONFIG.apiKey),
    model: toStringValue(input.model, DEFAULT_OPERATION_GUIDE_CONFIG.model),
    maxTokens: clampNumber(input.maxTokens, 1000, 12000, DEFAULT_OPERATION_GUIDE_CONFIG.maxTokens),
    systemPrompt: toStringValue(input.systemPrompt, DEFAULT_OPERATION_GUIDE_CONFIG.systemPrompt),
    lastTargetSoftware: toStringValue(input.lastTargetSoftware, DEFAULT_OPERATION_GUIDE_CONFIG.lastTargetSoftware),
  };
}

export class OperationGuideConfigManager {
  private store: JsonConfigStore<OperationGuideConfig>;

  constructor() {
    this.store = new JsonConfigStore<OperationGuideConfig>({
      fileName: 'operation-guide.json',
      defaults: DEFAULT_OPERATION_GUIDE_CONFIG,
      namespace: 'OperationGuideConfig',
      normalize: normalizeOperationGuideConfig,
    });
  }

  get(): OperationGuideConfig {
    return this.store.get();
  }

  async update(partial: Partial<OperationGuideConfig>): Promise<OperationGuideConfig> {
    this.store.update(partial);
    return this.store.get();
  }
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1', 'on'].includes(normalized)) return true;
    if (['false', 'no', '0', 'off'].includes(normalized)) return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return fallback;
}

function toStringValue(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}
