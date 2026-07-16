import WebSocket from 'ws';
import { ASRConfig } from './asr-config';
import { ASREngine, ASRStreamInput, ASRTranscriptEvent } from './asr-engine';

const FUNASR_POLL_INTERVAL_MS = 20;
const FUNASR_OPEN_TIMEOUT_MS = 5_000;
const FUNASR_FINAL_GRACE_MS = 5_000;
const FUNASR_CONNECTION_FAILURE_MESSAGE = 'FunASR 本地服务连接失败：请确认 FunASR runtime 已启动，端口与 Base URL 一致，并且 WebSocket 服务可访问。';

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
  return event.type === 'final' || (event.type === 'error' && !event.recoverable);
}

function closeSocket(socket: WebSocket): void {
  if (socket.readyState === WebSocket.CLOSED) return;
  try {
    socket.close();
  } catch {
    if (typeof socket.terminate === 'function') {
      socket.terminate();
    }
  }
}

function queueSend(
  socket: WebSocket,
  pending: ASRTranscriptEvent[],
  payload: string | Buffer,
  sessionId: string,
): boolean {
  try {
    socket.send(payload);
    return true;
  } catch (error) {
    pending.push({
      type: 'error',
      message: error instanceof Error && error.message ? error.message : FUNASR_CONNECTION_FAILURE_MESSAGE,
      sessionId,
      recoverable: false,
    });
    closeSocket(socket);
    return false;
  }
}

function hasPendingFatalError(pending: ASRTranscriptEvent[]): boolean {
  return pending.some((event) => event.type === 'error' && !event.recoverable);
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

export async function testFunASRLocalConnection(config: ASRConfig): Promise<{ success: boolean; message: string }> {
  return await new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket;
    try {
      socket = new WebSocket(createFunASRLocalUrl(config));
    } catch (error) {
      resolve({
        success: false,
        message: error instanceof Error ? error.message : 'FunASR Base URL 无效',
      });
      return;
    }

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      resolve({
        success: false,
        message: FUNASR_CONNECTION_FAILURE_MESSAGE,
      });
    }, 3_000);

    socket.on('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.close();
      resolve({ success: true, message: 'FunASR 本地服务连接成功' });
    });

    socket.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      closeSocket(socket);
      resolve({
        success: false,
        message: error.message || FUNASR_CONNECTION_FAILURE_MESSAGE,
      });
    });
  });
}

export class FunASRLocalEngine implements ASREngine {
  readonly provider = 'funasr-local-runtime';

  supportsStreaming(_config: ASRConfig): boolean {
    return true;
  }

  async *stream(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
    let url: string;
    try {
      url = createFunASRLocalUrl(input.config);
    } catch (error) {
      yield {
        type: 'error',
        message: error instanceof Error ? error.message : 'FunASR Base URL 无效',
        sessionId: input.sessionId,
        recoverable: false,
      };
      return;
    }

    const pending: ASRTranscriptEvent[] = [];
    let opened = false;
    let closed = false;
    const socket = new WebSocket(url);

    socket.on('open', () => {
      if (closed || input.signal?.aborted) {
        closeSocket(socket);
        return;
      }
      opened = true;
      queueSend(socket, pending, JSON.stringify(createFunASRStartEvent(input.config)), input.sessionId);
    });
    socket.on('message', (data) => {
      try {
        const normalized = normalizeFunASREvent(JSON.parse(data.toString()), input.sessionId);
        if (normalized) pending.push(normalized);
      } catch {
        pending.push({
          type: 'error',
          message: 'Invalid FunASR event payload',
          sessionId: input.sessionId,
          recoverable: true,
        });
      }
    });
    socket.on('close', () => { closed = true; });
    socket.on('error', (error) => {
      if (!hasPendingFatalError(pending)) {
        pending.push({
          type: 'error',
          message: error.message || FUNASR_CONNECTION_FAILURE_MESSAGE,
          sessionId: input.sessionId,
          recoverable: false,
        });
      }
      closed = true;
    });

    const openDeadline = Date.now() + FUNASR_OPEN_TIMEOUT_MS;
    while (!opened && !closed && !input.signal?.aborted && Date.now() < openDeadline) {
      await sleep(FUNASR_POLL_INTERVAL_MS);
    }

    if (!opened) {
      closeSocket(socket);
      let yieldedFatalError = false;
      while (pending.length > 0) {
        const event = pending.shift()!;
        yieldedFatalError = yieldedFatalError || isTerminalEvent(event);
        yield event;
      }
      if (!input.signal?.aborted && !yieldedFatalError) {
        yield {
          type: 'error',
          message: FUNASR_CONNECTION_FAILURE_MESSAGE,
          sessionId: input.sessionId,
          recoverable: false,
        };
      }
      return;
    }

    let terminalReceived = false;
    try {
      while (pending.length > 0) {
        const event = pending.shift()!;
        terminalReceived = terminalReceived || isTerminalEvent(event);
        yield event;
      }

      if (!terminalReceived) {
        for await (const chunk of input.chunks) {
          if (input.signal?.aborted || closed) break;
          if (!queueSend(socket, pending, Buffer.from(chunk.base64, 'base64'), input.sessionId)) break;
          while (pending.length > 0) {
            const event = pending.shift()!;
            terminalReceived = terminalReceived || isTerminalEvent(event);
            yield event;
          }
          if (terminalReceived) break;
        }
      }

      if (!closed && !input.signal?.aborted && !terminalReceived) {
        queueSend(socket, pending, JSON.stringify(createFunASREndEvent()), input.sessionId);
        for await (const event of drainFunASREvents(pending, () => closed || Boolean(input.signal?.aborted))) {
          terminalReceived = terminalReceived || isTerminalEvent(event);
          yield event;
        }
      }
    } finally {
      closeSocket(socket);
    }

    while (pending.length > 0) {
      const event = pending.shift()!;
      terminalReceived = terminalReceived || isTerminalEvent(event);
      yield event;
    }

    if (!terminalReceived && !input.signal?.aborted) {
      yield {
        type: 'error',
        message: 'FunASR 未返回识别文本，请确认服务模式、音频格式和模型配置',
        sessionId: input.sessionId,
        recoverable: false,
      };
    }
  }
}
