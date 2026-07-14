import { TTSConfig } from './tts-config';
import { TTSGptSoVits } from './tts-gpt-sovits';
import { TTSApi } from './tts-api';
import { TTSMiMo } from './tts-mimo';
import { TTSAliyun } from './tts-aliyun';

export interface TTSAudioResult {
  base64: string;
  mimeType?: string;
}

export interface TTSEngine {
  synthesize(text: string): Promise<TTSAudioResult>;
  test(): Promise<boolean>;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64');
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const bytes = Buffer.from(base64, 'base64');
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function createTTSEngine(config: TTSConfig): TTSEngine {
  if (config.mode === 'gpt-sovits') {
    return new TTSGptSoVits(config);
  }
  if (config.mode === 'mimo') {
    return new TTSMiMo(config);
  }
  if (config.mode === 'aliyun') {
    return new TTSAliyun(config);
  }
  return new TTSApi(config);
}
