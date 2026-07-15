import { ASRConfig } from './asr-config';
import { ASREngine, ASRStreamInput, ASRTranscriptEvent, VoiceAudioChunk } from './asr-engine';

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

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function* chunkedFallback(input: ASRStreamInput): AsyncIterable<ASRTranscriptEvent> {
  for await (const chunk of input.chunks) {
    const text = await transcribeChunk(input.config, chunk);
    if (text.trim()) {
      yield { type: 'partial', text, sessionId: input.sessionId };
    }
  }
  yield { type: 'final', text: '', sessionId: input.sessionId };
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

    const url = joinUrl(input.config.baseUrl.replace(/^http/, 'ws'), input.config.realtimePath);
    const socket = new websocketCtor(`${url}?model=${encodeURIComponent(input.config.model)}`);
    const pending: ASRTranscriptEvent[] = [];
    let opened = false;
    let closed = false;

    socket.addEventListener('open', () => { opened = true; });
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
      await new Promise((resolve) => setTimeout(resolve, 20));
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
      socket.close();
    }

    while (pending.length > 0) {
      yield pending.shift()!;
    }
  }
}
