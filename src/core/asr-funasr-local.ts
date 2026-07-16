import WebSocket from 'ws';
import { ASRConfig } from './asr-config';
import { ASREngine, ASRStreamInput, ASRTranscriptEvent } from './asr-engine';

const FUNASR_POLL_INTERVAL_MS = 20;
const FUNASR_FINAL_GRACE_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStringField(data: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = data[name];
    if (typeof value === 'string') return value;
  }
  return '';
}

function isFinalMode(mode: string): boolean {
  return mode === '2pass-offline' || mode === 'offline' || mode === 'final';
}

export function createFunASRLocalUrl(config: ASRConfig): string {
  const baseUrl = config.baseUrl.trim();
  if (!baseUrl) {
    throw new Error('FunASR Base URL 不能为空');
  }
  if (!baseUrl.startsWith('ws://') && !baseUrl.startsWith('wss://')) {
    throw new Error('FunASR Base URL 必须以 ws:// 或 wss:// 开头');
  }
  return new URL(baseUrl).toString();
}

export function createFunASRStartEvent(_config: ASRConfig): {
  mode: '2pass';
  chunk_size: number[];
  chunk_interval: number;
  wav_name: string;
  is_speaking: true;
  hotwords: string;
  itn: true;
} {
  return {
    mode: '2pass',
    chunk_size: [5, 10, 5],
    chunk_interval: 10,
    wav_name: 'project-ze',
    is_speaking: true,
    hotwords: '',
    itn: true,
  };
}

export function createFunASREndEvent(): { is_speaking: false } {
  return { is_speaking: false };
}

export function normalizeFunASREvent(raw: unknown, sessionId: string): ASRTranscriptEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const message = getStringField(data, ['error', 'message']);
  if (message) {
    return { type: 'error', message, sessionId, recoverable: false };
  }

  const text = getStringField(data, ['text', 'sentence', 'result']).trim();
  if (!text) return null;

  const mode = getStringField(data, ['mode', 'type']);
  const isFinal = data.is_final === true || data.final === true || isFinalMode(mode);
  return isFinal
    ? { type: 'final', text, sessionId }
    : { type: 'partial', text, sessionId };
}

function isTerminalEvent(event: ASRTranscriptEvent): boolean {
  return event.type === 'final' || event.type === 'error';
}

async function* drainFunASREvents(
  pending: ASRTranscriptEvent[],
  isClosed: () => boolean,
  timeoutMs: number = FUNASR_FINAL_GRACE_MS,
): AsyncIterable<ASRTranscriptEvent> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline || pending.length > 0) {
    while (pending.length > 0) {
      const event = pending.shift()!;
      yield event;
      if (isTerminalEvent(event)) return;
    }
    if (isClosed()) return;
    await sleep(FUNASR_POLL_INTERVAL_MS);
  }
}

export class FunASRLocalEngine implements ASREngine {
  readonly provider = 'funasr-local-runtime';

  supportsStreaming(_config: ASRConfig): boolean {
    return true;
  }

  async *stream(_input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
    throw new Error('FunASRLocalEngine.stream is wired in Task 3');
  }
}

export const __funasrTestInternals = {
  drainFunASREvents,
  isTerminalEvent,
  WebSocket,
};
