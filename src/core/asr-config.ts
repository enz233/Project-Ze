import { JsonConfigStore } from './json-config-store';

export type ASRProvider = 'openai-compatible' | 'aliyun' | 'custom';
export type ASRStreamingMode = 'realtime' | 'chunked-fallback';

export interface ASRCacheConfig {
  enabled: boolean;
  retentionMinutes: number;
  maxSessionBytes: number;
}

export interface ASRConfig {
  enabled: boolean;
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

export const DEFAULT_ASR_CONFIG: ASRConfig = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini-transcribe',
  realtimePath: '/realtime',
  transcriptionPath: '/audio/transcriptions',
  streamingMode: 'realtime',
  language: 'zh',
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
