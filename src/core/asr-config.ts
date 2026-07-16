import { JsonConfigStore } from './json-config-store';

export type ASRProvider = 'openai-compatible' | 'qwen-asr-realtime' | 'funasr-local-runtime';
export type ASRProviderPreset = 'openai' | 'aliyun-bailian' | 'qwen-asr' | 'funasr-local' | 'custom-openai-compatible';
export type ASRStreamingMode = 'realtime' | 'chunked-fallback';

export interface ASRCacheConfig {
  enabled: boolean;
  retentionMinutes: number;
  maxSessionBytes: number;
}

export interface ASRProviderPresetDefinition {
  id: ASRProviderPreset;
  label: string;
  provider: ASRProvider;
  baseUrl: string;
  model: string;
  realtimePath: string;
  transcriptionPath: string;
  streamingMode: ASRStreamingMode;
  language: string;
  note: string;
}

export interface ASRConfig {
  enabled: boolean;
  advancedSettingsEnabled: boolean;
  providerPreset: ASRProviderPreset;
  provider: ASRProvider;
  baseUrl: string;
  workspaceId: string;
  apiKey: string;
  model: string;
  realtimePath: string;
  transcriptionPath: string;
  streamingMode: ASRStreamingMode;
  language: string;
  autoSendFinalTranscript: boolean;
  holdToTalkShortcut: string;
  cache: ASRCacheConfig;
}


export const ASR_PROVIDER_PRESETS: Record<ASRProviderPreset, ASRProviderPresetDefinition> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini-transcribe',
    realtimePath: '/realtime',
    transcriptionPath: '/audio/transcriptions',
    streamingMode: 'realtime',
    language: 'zh',
    note: 'OpenAI 官方语音识别接口，使用当前 OpenAI-compatible ASR 引擎。',
  },
  'aliyun-bailian': {
    id: 'aliyun-bailian',
    label: '阿里百炼 / DashScope',
    provider: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: '',
    realtimePath: '/realtime',
    transcriptionPath: '/audio/transcriptions',
    streamingMode: 'chunked-fallback',
    language: 'zh',
    note: '阿里百炼预设复用 OpenAI-compatible ASR 引擎；请填写 DashScope API Key 和兼容 ASR 模型。若所选模型不支持当前路径，请改用自定义路径或后续添加专用 provider engine。',
  },
  'qwen-asr': {
    id: 'qwen-asr',
    label: 'Qwen-ASR 实时识别',
    provider: 'qwen-asr-realtime',
    baseUrl: 'wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com',
    model: '',
    realtimePath: '/api-ws/v1/realtime',
    transcriptionPath: '/audio/transcriptions',
    streamingMode: 'realtime',
    language: 'zh',
    note: 'Qwen-ASR 实时语音识别使用专用 WebSocket 协议；请填写 Workspace ID、API Key 和模型，运行时不会请求 OpenAI /audio/transcriptions。',
  },
  'funasr-local': {
    id: 'funasr-local',
    label: 'FunASR 本地识别',
    provider: 'funasr-local-runtime',
    baseUrl: 'ws://127.0.0.1:10096',
    model: '',
    realtimePath: '',
    transcriptionPath: '',
    streamingMode: 'realtime',
    language: 'zh',
    note: 'FunASR 本地识别连接用户已启动的本机 runtime WebSocket 服务；Project-Ze 不会自动安装 FunASR、下载模型或启动 Docker/Python 进程。',
  },
  'custom-openai-compatible': {
    id: 'custom-openai-compatible',
    label: '自定义 OpenAI-compatible',
    provider: 'openai-compatible',
    baseUrl: '',
    model: '',
    realtimePath: '/realtime',
    transcriptionPath: '/audio/transcriptions',
    streamingMode: 'chunked-fallback',
    language: 'zh',
    note: '用于兼容 OpenAI audio/transcriptions 或 realtime 风格接口的第三方服务；Base URL、路径和模型由用户维护。',
  },
};

const DEFAULT_ASR_PROVIDER_PRESET: ASRProviderPreset = 'openai';

function isASRProvider(value: unknown): value is ASRProvider {
  return value === 'openai-compatible'
    || value === 'qwen-asr-realtime'
    || value === 'funasr-local-runtime';
}

function isASRStreamingMode(value: unknown): value is ASRStreamingMode {
  return value === 'realtime' || value === 'chunked-fallback';
}

function normalizeString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function isASRProviderPreset(value: unknown): value is ASRProviderPreset {
  return typeof value === 'string'
    && Object.prototype.hasOwnProperty.call(ASR_PROVIDER_PRESETS, value);
}

function matchesPresetManagedFields(config: ASRConfig, preset: ASRProviderPreset): boolean {
  const definition = ASR_PROVIDER_PRESETS[preset];
  return config.provider === definition.provider
    && config.baseUrl === definition.baseUrl
    && config.model === definition.model
    && config.realtimePath === definition.realtimePath
    && config.transcriptionPath === definition.transcriptionPath
    && (config.streamingMode === definition.streamingMode
      || (preset === 'openai' && config.streamingMode === DEFAULT_ASR_CONFIG.streamingMode))
    && config.language === definition.language;
}

export function inferASRProviderPreset(config: ASRConfig): ASRProviderPreset {
  if (matchesPresetManagedFields(config, 'openai')) return 'openai';
  if (matchesPresetManagedFields(config, 'aliyun-bailian')) return 'aliyun-bailian';
  if (config.provider === 'qwen-asr-realtime') return 'qwen-asr';
  if (config.provider === 'funasr-local-runtime') return 'funasr-local';
  return 'custom-openai-compatible';
}
function hasDefaultCache(cache: ASRCacheConfig): boolean {
  return cache.enabled === DEFAULT_ASR_CONFIG.cache.enabled
    && cache.retentionMinutes === DEFAULT_ASR_CONFIG.cache.retentionMinutes
    && cache.maxSessionBytes === DEFAULT_ASR_CONFIG.cache.maxSessionBytes;
}

function hasLegacyCustomizedAdvancedFields(raw: Record<string, unknown>, normalized: ASRConfig): boolean {
  if (isASRProviderPreset(raw.providerPreset) && raw.providerPreset !== DEFAULT_ASR_PROVIDER_PRESET) return true;
  if (normalized.provider !== DEFAULT_ASR_CONFIG.provider) return true;
  if (normalized.baseUrl !== DEFAULT_ASR_CONFIG.baseUrl) return true;
  if (normalized.workspaceId !== DEFAULT_ASR_CONFIG.workspaceId) return true;
  if (normalized.realtimePath !== DEFAULT_ASR_CONFIG.realtimePath) return true;
  if (normalized.transcriptionPath !== DEFAULT_ASR_CONFIG.transcriptionPath) return true;
  if (!hasDefaultCache(normalized.cache)) return true;
  return false;
}

function applyNormalModeAdvancedDefaults(config: ASRConfig): ASRConfig {
  const providerPreset = isASRProviderPreset(config.providerPreset)
    ? config.providerPreset
    : inferASRProviderPreset(config);
  const preset = ASR_PROVIDER_PRESETS[providerPreset];
  return {
    ...config,
    advancedSettingsEnabled: false,
    providerPreset,
    provider: preset.provider,
    baseUrl: config.baseUrl || preset.baseUrl || DEFAULT_ASR_CONFIG.baseUrl,
    realtimePath: preset.realtimePath,
    transcriptionPath: preset.transcriptionPath,
    streamingMode: providerPreset === 'qwen-asr' || providerPreset === 'funasr-local'
      ? preset.streamingMode
      : DEFAULT_ASR_CONFIG.streamingMode,
    cache: { ...DEFAULT_ASR_CONFIG.cache },
  };
}

export function normalizeASRConfigForLoad(config: Partial<ASRConfig>): ASRConfig {
  const raw = config as Record<string, unknown>;
  const defaultCache = DEFAULT_ASR_CONFIG.cache;
  const rawCache = raw.cache && typeof raw.cache === 'object'
    ? raw.cache as Partial<ASRCacheConfig>
    : {};

  let normalized: ASRConfig = {
    ...DEFAULT_ASR_CONFIG,
    ...config,
    enabled: normalizeBoolean(raw.enabled, DEFAULT_ASR_CONFIG.enabled),
    advancedSettingsEnabled: DEFAULT_ASR_CONFIG.advancedSettingsEnabled,
    provider: isASRProvider(raw.provider) ? raw.provider : DEFAULT_ASR_CONFIG.provider,
    baseUrl: normalizeString(raw.baseUrl, DEFAULT_ASR_CONFIG.baseUrl),
    workspaceId: normalizeString(raw.workspaceId, DEFAULT_ASR_CONFIG.workspaceId),
    apiKey: normalizeString(raw.apiKey, DEFAULT_ASR_CONFIG.apiKey),
    model: normalizeString(raw.model, DEFAULT_ASR_CONFIG.model),
    realtimePath: normalizeString(raw.realtimePath, DEFAULT_ASR_CONFIG.realtimePath),
    transcriptionPath: normalizeString(raw.transcriptionPath, DEFAULT_ASR_CONFIG.transcriptionPath),
    streamingMode: isASRStreamingMode(raw.streamingMode) ? raw.streamingMode : DEFAULT_ASR_CONFIG.streamingMode,
    language: normalizeString(raw.language, DEFAULT_ASR_CONFIG.language),
    autoSendFinalTranscript: normalizeBoolean(raw.autoSendFinalTranscript, DEFAULT_ASR_CONFIG.autoSendFinalTranscript),
    holdToTalkShortcut: normalizeString(raw.holdToTalkShortcut, DEFAULT_ASR_CONFIG.holdToTalkShortcut),
    cache: {
      ...defaultCache,
      ...rawCache,
      enabled: normalizeBoolean(rawCache.enabled, defaultCache.enabled),
      retentionMinutes: normalizePositiveNumber(rawCache.retentionMinutes, defaultCache.retentionMinutes),
      maxSessionBytes: normalizePositiveNumber(rawCache.maxSessionBytes, defaultCache.maxSessionBytes),
    },
  };

  normalized.providerPreset = isASRProviderPreset(config.providerPreset)
    ? config.providerPreset
    : inferASRProviderPreset(normalized);

  normalized.advancedSettingsEnabled = typeof raw.advancedSettingsEnabled === 'boolean'
    ? raw.advancedSettingsEnabled
    : hasLegacyCustomizedAdvancedFields(raw, normalized);

  return normalized.advancedSettingsEnabled ? normalized : applyNormalModeAdvancedDefaults(normalized);
}

export function applyASRProviderPreset(config: ASRConfig, preset: ASRProviderPreset): ASRConfig {
  const presetKey = isASRProviderPreset(preset) ? preset : DEFAULT_ASR_PROVIDER_PRESET;
  const definition = ASR_PROVIDER_PRESETS[presetKey];
  return {
    ...config,
    providerPreset: presetKey,
    provider: definition.provider,
    baseUrl: definition.baseUrl,
    model: definition.model,
    realtimePath: definition.realtimePath,
    transcriptionPath: definition.transcriptionPath,
    streamingMode: definition.streamingMode,
    language: definition.language,
    apiKey: definition.provider === 'funasr-local-runtime' ? '' : config.apiKey,
  };
}

const OPENAI_ASR_PRESET = ASR_PROVIDER_PRESETS.openai;

export const DEFAULT_ASR_CONFIG: ASRConfig = {
  enabled: false,
  advancedSettingsEnabled: false,
  providerPreset: DEFAULT_ASR_PROVIDER_PRESET,
  provider: OPENAI_ASR_PRESET.provider,
  baseUrl: OPENAI_ASR_PRESET.baseUrl,
  workspaceId: '',
  apiKey: '',
  model: OPENAI_ASR_PRESET.model,
  realtimePath: OPENAI_ASR_PRESET.realtimePath,
  transcriptionPath: OPENAI_ASR_PRESET.transcriptionPath,
  streamingMode: 'chunked-fallback',
  language: OPENAI_ASR_PRESET.language,
  autoSendFinalTranscript: false,
  holdToTalkShortcut: 'Ctrl+Shift+Space',
  cache: {
    enabled: true,
    retentionMinutes: 30,
    maxSessionBytes: 10 * 1024 * 1024,
  },
};

export class ASRConfigManager {
  private store: JsonConfigStore<ASRConfig>;

  constructor() {
    this.store = new JsonConfigStore<ASRConfig>({
      fileName: 'asr.json',
      defaults: DEFAULT_ASR_CONFIG,
      namespace: 'ASRConfig',
      normalize: normalizeASRConfigForLoad,
    });
  }

  get(): ASRConfig {
    return this.store.get();
  }

  update(partial: Partial<ASRConfig>): void {
    this.store.update(partial);
  }

  save(): void {
    this.store.save();
  }
}
