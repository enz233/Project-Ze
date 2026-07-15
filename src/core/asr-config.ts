import { JsonConfigStore } from './json-config-store';

export type ASRProvider = 'openai-compatible';
export type ASRProviderPreset = 'openai' | 'aliyun-bailian' | 'custom-openai-compatible';
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
  providerPreset: ASRProviderPreset;
  provider: ASRProvider;
  baseUrl: string;
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

function isASRProviderPreset(value: unknown): value is ASRProviderPreset {
  return typeof value === 'string' && value in ASR_PROVIDER_PRESETS;
}

function matchesPresetManagedFields(config: ASRConfig, preset: ASRProviderPreset): boolean {
  const definition = ASR_PROVIDER_PRESETS[preset];
  return config.provider === definition.provider
    && config.baseUrl === definition.baseUrl
    && config.model === definition.model
    && config.realtimePath === definition.realtimePath
    && config.transcriptionPath === definition.transcriptionPath
    && config.streamingMode === definition.streamingMode
    && config.language === definition.language;
}

export function inferASRProviderPreset(config: ASRConfig): ASRProviderPreset {
  if (matchesPresetManagedFields(config, 'openai')) return 'openai';
  if (matchesPresetManagedFields(config, 'aliyun-bailian')) return 'aliyun-bailian';
  return 'custom-openai-compatible';
}

export function normalizeASRConfigForLoad(config: Partial<ASRConfig>): ASRConfig {
  const normalized: ASRConfig = { ...DEFAULT_ASR_CONFIG, ...config };
  normalized.providerPreset = isASRProviderPreset(config.providerPreset)
    ? config.providerPreset
    : inferASRProviderPreset(normalized);
  return normalized;
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
  };
}

const OPENAI_ASR_PRESET = ASR_PROVIDER_PRESETS.openai;

export const DEFAULT_ASR_CONFIG: ASRConfig = {
  enabled: false,
  providerPreset: DEFAULT_ASR_PROVIDER_PRESET,
  provider: OPENAI_ASR_PRESET.provider,
  baseUrl: OPENAI_ASR_PRESET.baseUrl,
  apiKey: '',
  model: OPENAI_ASR_PRESET.model,
  realtimePath: OPENAI_ASR_PRESET.realtimePath,
  transcriptionPath: OPENAI_ASR_PRESET.transcriptionPath,
  streamingMode: OPENAI_ASR_PRESET.streamingMode,
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
