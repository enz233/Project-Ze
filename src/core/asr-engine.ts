import { ASRConfig } from './asr-config';
import { OpenAICompatibleASREngine } from './asr-openai-compatible';

export interface VoiceAudioChunk {
  sessionId: string;
  sequence: number;
  mimeType: string;
  base64: string;
  capturedAt: number;
  durationMs?: number;
}

export type ASRTranscriptEvent =
  | { type: 'partial'; text: string; sessionId: string }
  | { type: 'final'; text: string; sessionId: string; audioRef?: string }
  | { type: 'error'; message: string; sessionId: string; recoverable: boolean };

export interface ASRStreamInput {
  sessionId: string;
  config: ASRConfig;
  chunks: AsyncIterable<VoiceAudioChunk>;
  signal?: AbortSignal;
}

export interface ASREngine {
  readonly provider: string;
  supportsStreaming(config: ASRConfig): boolean;
  stream(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent>;
}

export function createASREngine(config: ASRConfig): ASREngine {
  if (config.provider === 'openai-compatible') {
    return new OpenAICompatibleASREngine();
  }
  return new OpenAICompatibleASREngine();
}
