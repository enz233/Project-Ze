/**
 * 阿里云百炼 TTS 引擎
 *
 * 调用阿里云百炼 qwen3-tts 系列非实时语音合成模型。
 * 默认 API: POST {baseURL}/services/aigc/multimodal-generation/generation
 * 格式：DashScope MultiModalConversation。
 *
 * 支持：
 * - qwen3-tts-flash（系统音色）
 * - qwen3-tts-instruct-flash（指令控制，需服务端支持）
 * - qwen3-tts-vd-*（设计音色，voice 填实际设计音色 ID）
 */

import { TTSConfig } from './tts-config';
import { TTSAudioResult, TTSEngine, arrayBufferToBase64, normalizeBase64Audio } from './tts-engine';

export class TTSAliyun implements TTSEngine {
  private config: TTSConfig;

  constructor(config: TTSConfig) {
    this.config = config;
  }

  private buildUrl(): string {
    const baseURL = (this.config.aliyunBaseURL || 'https://dashscope.aliyuncs.com/api/v1').replace(/\/+$/, '');
    const endpointPath = (this.config.aliyunEndpointPath || '/services/aigc/multimodal-generation/generation').replace(/^\/+/, '');
    return `${baseURL}/${endpointPath}`;
  }

  private formatError(status: number, body: string): string {
    const trimmed = body.trim();
    if (!trimmed) {
      return `阿里云 TTS 请求失败 (${status})`;
    }

    try {
      const data = JSON.parse(trimmed) as { code?: string; message?: string; request_id?: string };
      const detail = [data.code, data.message].filter(Boolean).join(' - ');
      if (detail) {
        return `阿里云 TTS 请求失败 (${status}): ${detail}`;
      }
    } catch {
      // 非 JSON 响应，使用原始文本。
    }

    return `阿里云 TTS 请求失败 (${status}): ${trimmed}`;
  }

  /** 合成语音，返回音频 base64 */
  async synthesize(text: string): Promise<TTSAudioResult> {
    const url = this.buildUrl();
    const voice = this.config.aliyunVoice || 'Cherry';

    const body: any = {
      model: this.config.aliyunModel || 'qwen3-tts-flash',
      input: {
        text: text,
        voice: voice,
      },
    };

    // 语言类型
    if (this.config.aliyunLanguage && this.config.aliyunLanguage !== 'auto') {
      body.input.language_type = this.config.aliyunLanguage;
    }

    console.log('[Aliyun TTS] 请求 URL:', url);
    console.log('[Aliyun TTS] 请求体:', JSON.stringify(body, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.aliyunApiKey}`,
      },
      body: JSON.stringify(body),
    });

    console.log('[Aliyun TTS] 响应状态:', response.status);

    if (!response.ok) {
      const error = await response.text();
      console.error('[Aliyun TTS] 错误响应:', error);
      throw new Error(this.formatError(response.status, error));
    }

    const data = await response.json() as any;
    console.log('[Aliyun TTS] 响应数据:', JSON.stringify(data).slice(0, 500));

    // DashScope 响应格式：output.audio.data (base64) 或 output.audio.url
    const audio = data.output?.audio;
    if (!audio) {
      throw new Error('阿里云 TTS 未返回音频数据');
    }

    if (audio.data) {
      return { base64: normalizeBase64Audio(audio.data), mimeType: 'audio/wav' };
    }

    if (audio.url) {
      // 下载音频文件
      const audioResponse = await fetch(audio.url);
      if (!audioResponse.ok) throw new Error('下载音频失败');
      return { base64: arrayBufferToBase64(await audioResponse.arrayBuffer()), mimeType: 'audio/wav' };
    }

    throw new Error('阿里云 TTS 返回格式异常');
  }

  /** 测试连接 */
  async test(): Promise<boolean> {
    await this.synthesize('测试');
    return true;
  }
}
