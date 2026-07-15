import { JsonConfigStore } from './json-config-store';

export type TTSMode = 'gpt-sovits' | 'api' | 'mimo' | 'aliyun';
export type TTSLanguage = 'zh' | 'en' | 'ja';

export interface TTSConfig {
  on: boolean;
  mode: TTSMode;
  ttsLanguage: TTSLanguage;       // TTS 语音语言
  subtitleLanguage: TTSLanguage;   // 字幕显示语言（可独立于 TTS）
  // GPT-SoVITS
  gptSovitsURL: string;
  gptSovitsTextLang: string;
  // 外部 TTS API
  ttsApiKey: string;
  ttsBaseURL: string;
  ttsModel: string;
  ttsVoice: string;
  ttsSpeed: number;
  // MiMo TTS
  mimoApiKey: string;
  mimoBaseURL: string;
  mimoModel: string;
  mimoVoice: string;
  mimoVoiceDesign: string;
  // 阿里云百炼 TTS
  aliyunApiKey: string;
  aliyunBaseURL: string;
  aliyunEndpointPath: string;
  aliyunModel: string;
  aliyunVoice: string;
  aliyunLanguage: string;
}

const DEFAULT_CONFIG: TTSConfig = {
  on: false,
  mode: 'gpt-sovits',
  ttsLanguage: 'zh',
  subtitleLanguage: 'zh',
  gptSovitsURL: 'http://127.0.0.1:9880',
  gptSovitsTextLang: 'zh',
  ttsApiKey: '',
  ttsBaseURL: 'https://api.openai.com/v1',
  ttsModel: 'tts-1',
  ttsVoice: 'alloy',
  ttsSpeed: 1.0,
  mimoApiKey: '',
  mimoBaseURL: 'https://api.xiaomi.com/v1',
  mimoModel: 'mimo-v2.5-tts',
  mimoVoice: '冰糖',
  mimoVoiceDesign: '温柔可爱的少女声音，说话轻声细语',
  aliyunApiKey: '',
  aliyunBaseURL: 'https://dashscope.aliyuncs.com/api/v1',
  aliyunEndpointPath: '/services/aigc/multimodal-generation/generation',
  aliyunModel: 'qwen3-tts-flash',
  aliyunVoice: 'Cherry',
  aliyunLanguage: 'auto',
};

export class TTSConfigManager {
  private store: JsonConfigStore<TTSConfig>;

  constructor() {
    this.store = new JsonConfigStore<TTSConfig>({
      fileName: 'tts.json',
      defaults: DEFAULT_CONFIG,
      namespace: 'TTSConfig',
    });
  }

  save(): void {
    this.store.save();
  }

  get(): TTSConfig {
    return this.store.get();
  }

  update(partial: Partial<TTSConfig>): void {
    this.store.update(partial);
  }
}
