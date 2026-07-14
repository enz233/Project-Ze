/**
 * MiMo TTS 引擎
 *
 * 调用小米 MiMo V2.5 TTS API（OpenAI 兼容的 chat/completions 格式）
 * 模型：mimo-v2.5-tts / mimo-v2.5-tts-voicedesign / mimo-v2.5-tts-voiceclone
 */

import { TTSConfig } from './tts-config';
import { TTSAudioResult, TTSEngine, normalizeBase64Audio } from './tts-engine';

export class TTSMiMo implements TTSEngine {
  private config: TTSConfig;

  constructor(config: TTSConfig) {
    this.config = config;
  }

  /** 合成语音，返回音频 base64 */
  async synthesize(text: string): Promise<TTSAudioResult> {
    const url = `${this.config.mimoBaseURL}/chat/completions`;

    // 构建请求
    const body: any = {
      model: this.config.mimoModel || 'mimo-v2.5-tts',
      messages: [
        { role: 'user', content: this.config.mimoVoiceDesign || '' },
        { role: 'assistant', content: text },
      ],
      audio: {
        format: 'wav',
      },
    };

    // 如果是内置音色模型，设置 voice
    if (this.config.mimoModel === 'mimo-v2.5-tts' && this.config.mimoVoice) {
      body.audio.voice = this.config.mimoVoice;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.config.mimoApiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`MiMo TTS 请求失败 (${response.status}): ${error}`);
    }

    const data = await response.json() as any;
    const audioBase64 = data.choices?.[0]?.message?.audio?.data;
    if (!audioBase64) {
      throw new Error('MiMo TTS 未返回音频数据');
    }

    return { base64: normalizeBase64Audio(audioBase64), mimeType: 'audio/wav' };
  }

  /** 测试连接 */
  async test(): Promise<boolean> {
    try {
      await this.synthesize('测试');
      return true;
    } catch {
      return false;
    }
  }
}
