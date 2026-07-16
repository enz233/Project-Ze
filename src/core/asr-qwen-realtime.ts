import WebSocket from 'ws';
import { ASRConfig } from './asr-config';
import { ASREngine, ASRStreamInput, ASRTranscriptEvent } from './asr-engine';

const QWEN_FINAL_EVENT_GRACE_MS = 15_000;
const QWEN_POLL_INTERVAL_MS = 20;
const QWEN_MISSING_TRANSCRIPTION_MESSAGE = 'Qwen-ASR 已结束但未返回识别文本：请确认麦克风有声音、录音格式被模型支持，或查看阿里云侧错误事件。';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function createQwenASRRealtimeUrl(config: ASRConfig): string {
  const workspaceId = config.workspaceId.trim();
  const baseUrl = config.baseUrl.replace('{WorkspaceId}', workspaceId);
  const url = new URL(joinUrl(baseUrl, config.realtimePath));
  url.searchParams.set('model', config.model);
  return url.toString();
}

export function createQwenASRHeaders(config: ASRConfig): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    'user-agent': 'Project-Ze',
  };
  if (config.workspaceId.trim()) {
    headers['X-DashScope-WorkSpace'] = config.workspaceId.trim();
  }
  return headers;
}

export function createQwenManualSessionUpdateEvent(): { type: 'session.update'; session: { turn_detection: null } } {
  return {
    type: 'session.update',
    session: { turn_detection: null },
  };
}

function getStringField(data: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = data[name];
    if (typeof value === 'string') return value;
  }
  return '';
}

function createQwenMissingTranscriptionEvent(sessionId: string): ASRTranscriptEvent {
  return {
    type: 'error',
    message: QWEN_MISSING_TRANSCRIPTION_MESSAGE,
    sessionId,
    recoverable: false,
  };
}

export function promoteQwenMissingTranscriptionEvent(
  event: ASRTranscriptEvent,
  fallbackText: string,
): ASRTranscriptEvent {
  if (event.type === 'error' && event.message === QWEN_MISSING_TRANSCRIPTION_MESSAGE && fallbackText.trim()) {
    return { type: 'final', text: fallbackText, sessionId: event.sessionId };
  }
  return event;
}

export function normalizeQwenASREvent(raw: unknown, sessionId: string): ASRTranscriptEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const type = String(data.type ?? '');

  if (type === 'conversation.item.input_audio_transcription.text') {
    const text = getStringField(data, ['text', 'transcript', 'delta']);
    return text ? { type: 'partial', text, sessionId } : null;
  }

  if (type === 'conversation.item.input_audio_transcription.completed') {
    const text = getStringField(data, ['transcript', 'text']);
    return text.trim()
      ? { type: 'final', text, sessionId }
      : createQwenMissingTranscriptionEvent(sessionId);
  }

  if (type === 'session.finished') {
    return createQwenMissingTranscriptionEvent(sessionId);
  }

  if (type === 'error') {
    const message = getStringField(data, ['message', 'error']) || 'Qwen-ASR provider error';
    return { type: 'error', message, sessionId, recoverable: false };
  }

  return null;
}

function isTerminalEvent(event: ASRTranscriptEvent): boolean {
  return event.type === 'final' || event.type === 'error';
}

async function* drainEventsUntilTerminal(
  pending: ASRTranscriptEvent[],
  isClosed: () => boolean,
  timeoutMs: number = QWEN_FINAL_EVENT_GRACE_MS,
): AsyncIterable<ASRTranscriptEvent> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline || pending.length > 0) {
    while (pending.length > 0) {
      const event = pending.shift()!;
      yield event;
      if (isTerminalEvent(event)) return;
    }
    if (isClosed()) return;
    await sleep(QWEN_POLL_INTERVAL_MS);
  }
}

export class QwenASRRealtimeEngine implements ASREngine {
  readonly provider = 'qwen-asr-realtime';

  supportsStreaming(_config: ASRConfig): boolean {
    return true;
  }

  async *stream(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
    if (!input.config.workspaceId.trim()) {
      yield { type: 'error', message: 'Qwen-ASR Workspace ID is required', sessionId: input.sessionId, recoverable: false };
      return;
    }
    if (!input.config.model.trim()) {
      yield { type: 'error', message: 'Qwen-ASR model is required', sessionId: input.sessionId, recoverable: false };
      return;
    }

    const pending: ASRTranscriptEvent[] = [];
    let opened = false;
    let closed = false;
    let lastTranscriptText = '';
    const socket = new WebSocket(createQwenASRRealtimeUrl(input.config), {
      headers: createQwenASRHeaders(input.config),
    });

    socket.on('open', () => {
      opened = true;
      socket.send(JSON.stringify(createQwenManualSessionUpdateEvent()));
    });
    socket.on('message', (data) => {
      try {
        const normalized = normalizeQwenASREvent(JSON.parse(data.toString()), input.sessionId);
        if (normalized) pending.push(normalized);
      } catch {
        pending.push({ type: 'error', message: 'Invalid Qwen-ASR event payload', sessionId: input.sessionId, recoverable: true });
      }
    });
    socket.on('close', () => { closed = true; });
    socket.on('error', (error) => {
      pending.push({ type: 'error', message: error.message || 'Qwen-ASR realtime connection failed', sessionId: input.sessionId, recoverable: false });
      closed = true;
    });

    while (!opened && !closed) {
      await sleep(QWEN_POLL_INTERVAL_MS);
    }

    if (!opened) {
      yield { type: 'error', message: 'Qwen-ASR realtime connection did not open', sessionId: input.sessionId, recoverable: false };
      return;
    }

    for await (const chunk of input.chunks) {
      if (input.signal?.aborted || closed) break;
      socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: chunk.base64 }));
      while (pending.length > 0) {
        const event = pending.shift()!;
        if (event.type === 'partial' || event.type === 'final') lastTranscriptText = event.text;
        yield event;
      }
    }

    let terminalReceived = false;
    if (!closed) {
      socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      socket.send(JSON.stringify({ type: 'session.finish' }));
      for await (const rawEvent of drainEventsUntilTerminal(pending, () => closed || Boolean(input.signal?.aborted))) {
        const event = promoteQwenMissingTranscriptionEvent(rawEvent, lastTranscriptText);
        if (event.type === 'partial' || event.type === 'final') lastTranscriptText = event.text;
        terminalReceived = terminalReceived || isTerminalEvent(event);
        yield event;
      }
      if (!closed) socket.close();
    }

    while (pending.length > 0) {
      const rawEvent = pending.shift()!;
      const event = promoteQwenMissingTranscriptionEvent(rawEvent, lastTranscriptText);
      if (event.type === 'partial' || event.type === 'final') lastTranscriptText = event.text;
      terminalReceived = terminalReceived || isTerminalEvent(event);
      yield event;
    }

    if (!terminalReceived && !input.signal?.aborted) {
      yield lastTranscriptText.trim()
        ? { type: 'final', text: lastTranscriptText, sessionId: input.sessionId }
        : createQwenMissingTranscriptionEvent(input.sessionId);
    }
  }
}
