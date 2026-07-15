import { ASRConfig } from './asr-config';
import { ASREngine, ASRStreamInput, ASRTranscriptEvent, VoiceAudioChunk } from './asr-engine';

const REALTIME_FINAL_EVENT_GRACE_MS = 750;
const REALTIME_POLL_INTERVAL_MS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeTranscriptEvent(raw: unknown, sessionId: string): ASRTranscriptEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const type = String(data.type ?? '');

  if (type === 'partial' && typeof data.text === 'string') {
    return { type: 'partial', text: data.text, sessionId };
  }
  if (type === 'final' && typeof data.text === 'string') {
    return { type: 'final', text: data.text, sessionId };
  }
  if ((type === 'transcript.delta' || type === 'response.audio_transcript.delta') && typeof data.delta === 'string') {
    return { type: 'partial', text: data.delta, sessionId };
  }
  if ((type === 'transcript.completed' || type === 'response.audio_transcript.done') && typeof data.transcript === 'string') {
    return { type: 'final', text: data.transcript, sessionId };
  }
  if (type === 'error') {
    const message = typeof data.message === 'string' ? data.message : 'ASR provider error';
    return { type: 'error', message, sessionId, recoverable: false };
  }

  return null;
}

export function isRealtimeTerminalEvent(event: ASRTranscriptEvent): boolean {
  return event.type === 'final' || event.type === 'error';
}

async function* drainRealtimeEventsUntilTerminal(
  pending: ASRTranscriptEvent[],
  isClosed: () => boolean,
  timeoutMs: number = REALTIME_FINAL_EVENT_GRACE_MS,
): AsyncIterable<ASRTranscriptEvent> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline || pending.length > 0) {
    while (pending.length > 0) {
      const event = pending.shift()!;
      yield event;
      if (isRealtimeTerminalEvent(event)) return;
    }

    if (isClosed()) return;
    await sleep(REALTIME_POLL_INTERVAL_MS);
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function createRealtimeAuthProtocol(apiKey: string): string {
  return `openai-insecure-api-key.${apiKey}`;
}

function createRealtimeUrl(config: ASRConfig): string {
  const url = new URL(joinUrl(config.baseUrl.replace(/^http/, 'ws'), config.realtimePath));
  url.searchParams.set('model', config.model);
  return url.toString();
}

function shouldJoinTranscriptPartsWithSpace(previous: string, next: string): boolean {
  if (!previous || !next) return false;
  return /[A-Za-z0-9]$/.test(previous) && /^[A-Za-z0-9]/.test(next);
}

export function joinTranscriptParts(parts: string[]): string {
  let result = '';
  for (const part of parts) {
    if (!part) continue;
    if (shouldJoinTranscriptPartsWithSpace(result, part)) {
      result += ' ';
    }
    result += part;
  }
  return result;
}

async function* chunkedFallback(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
  const finalTextParts: string[] = [];

  try {
    for await (const chunk of input.chunks) {
      const text = await transcribeChunk(input.config, chunk);
      if (text.trim()) {
        finalTextParts.push(text);
        yield { type: 'partial', text, sessionId: input.sessionId };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ASR transcription failed';
    yield { type: 'error', message, sessionId: input.sessionId, recoverable: false };
    return;
  }

  yield { type: 'final', text: joinTranscriptParts(finalTextParts), sessionId: input.sessionId };
}

async function transcribeChunk(config: ASRConfig, chunk: VoiceAudioChunk): Promise<string> {
  const bytes = Buffer.from(chunk.base64, 'base64');
  const form = new FormData();
  const blob = new Blob([bytes], { type: chunk.mimeType });
  form.append('file', blob, `voice-${chunk.sequence}.webm`);
  form.append('model', config.model);
  if (config.language) form.append('language', config.language);

  const response = await fetch(joinUrl(config.baseUrl, config.transcriptionPath), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`ASR transcription failed: ${response.status}`);
  }

  const data = await response.json() as { text?: string };
  return data.text ?? '';
}

export class OpenAICompatibleASREngine implements ASREngine {
  readonly provider = 'openai-compatible';

  supportsStreaming(config: ASRConfig): boolean {
    return config.streamingMode === 'realtime';
  }

  async *stream(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
    if (input.config.streamingMode === 'chunked-fallback') {
      yield* chunkedFallback(input);
      return;
    }

    yield* this.streamRealtime(input);
  }

  private async *streamRealtime(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
    const websocketCtor = (globalThis as unknown as { WebSocket?: typeof WebSocket }).WebSocket;
    if (!websocketCtor) {
      yield { type: 'error', message: 'WebSocket is not available in this runtime', sessionId: input.sessionId, recoverable: false };
      return;
    }

    const socket = new websocketCtor(
      createRealtimeUrl(input.config),
      ['realtime', createRealtimeAuthProtocol(input.config.apiKey)]
    );
    const pending: ASRTranscriptEvent[] = [];
    let opened = false;
    let closed = false;

    socket.addEventListener('open', () => {
      opened = true;
      socket.send(JSON.stringify({ type: 'session.auth', api_key: input.config.apiKey }));
    });
    socket.addEventListener('message', (event) => {
      try {
        const normalized = normalizeTranscriptEvent(JSON.parse(String(event.data)), input.sessionId);
        if (normalized) pending.push(normalized);
      } catch {
        pending.push({ type: 'error', message: 'Invalid ASR event payload', sessionId: input.sessionId, recoverable: true });
      }
    });
    socket.addEventListener('close', () => { closed = true; });
    socket.addEventListener('error', () => {
      pending.push({ type: 'error', message: 'ASR realtime connection failed', sessionId: input.sessionId, recoverable: false });
      closed = true;
    });

    while (!opened && !closed) {
      await sleep(REALTIME_POLL_INTERVAL_MS);
    }

    if (!opened) {
      yield { type: 'error', message: 'ASR realtime connection did not open', sessionId: input.sessionId, recoverable: false };
      return;
    }

    for await (const chunk of input.chunks) {
      if (input.signal?.aborted || closed) break;
      socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: chunk.base64, mimeType: chunk.mimeType }));
      while (pending.length > 0) {
        yield pending.shift()!;
      }
    }

    if (!closed) {
      socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
      yield* drainRealtimeEventsUntilTerminal(pending, () => closed || Boolean(input.signal?.aborted));
      if (!closed) socket.close();
    }

    while (pending.length > 0) {
      yield pending.shift()!;
    }
  }
}
