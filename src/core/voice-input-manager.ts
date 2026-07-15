import { BrowserWindow } from 'electron';
import { ASRConfigManager } from './asr-config';
import { ASRTranscriptEvent, VoiceAudioChunk, createASREngine } from './asr-engine';
import { VoiceAudioCache } from './voice-audio-cache';

export type VoiceInputPhase = 'voice-idle' | 'voice-recording' | 'voice-transcribing' | 'voice-finalizing' | 'voice-error';

export interface VoiceInputStartOptions {
  source: 'button' | 'shortcut';
  mimeType: string;
}

export interface VoiceInputSessionInfo {
  sessionId: string;
  phase: VoiceInputPhase;
}

export interface VoiceInputDebugSnapshot {
  activeSessionId: string | null;
  phase: VoiceInputPhase;
  lastPartial: string;
  lastFinal: string;
  lastError: string | null;
}

interface ActiveVoiceSession {
  sessionId: string;
  source: 'button' | 'shortcut';
  mimeType: string;
  sequence: number;
  chunks: VoiceAudioChunk[];
  stopped: boolean;
}

export function createVoiceSessionId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class VoiceInputManager {
  private active: ActiveVoiceSession | null = null;
  private phase: VoiceInputPhase = 'voice-idle';
  private lastPartial = '';
  private lastFinal = '';
  private lastError: string | null = null;

  constructor(
    private mainWindow: BrowserWindow,
    private configManager: ASRConfigManager,
    private audioCache: VoiceAudioCache
  ) {}

  async startSession(options: VoiceInputStartOptions): Promise<VoiceInputSessionInfo> {
    if (this.active) {
      await this.cancelSession(this.active.sessionId);
    }
    const config = this.configManager.get();
    if (!config.enabled) {
      this.setError('Voice input is disabled');
      throw new Error('Voice input is disabled');
    }
    const sessionId = createVoiceSessionId();
    this.active = { sessionId, source: options.source, mimeType: options.mimeType, sequence: 0, chunks: [], stopped: false };
    await this.audioCache.createSession(sessionId);
    this.setPhase('voice-recording', '正在录音');
    return { sessionId, phase: this.phase };
  }

  async appendAudioChunk(sessionId: string, chunk: Omit<VoiceAudioChunk, 'sessionId' | 'sequence'>): Promise<void> {
    const session = this.requireSession(sessionId);
    const fullChunk: VoiceAudioChunk = { ...chunk, sessionId, sequence: session.sequence++ };
    session.chunks.push(fullChunk);
    await this.audioCache.appendChunk(sessionId, fullChunk);
    this.setPhase('voice-transcribing', '正在识别');
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.stopped = true;
    this.setPhase('voice-finalizing', '正在整理识别结果');
    const config = this.configManager.get();
    const engine = createASREngine(config);

    async function* chunks(): AsyncIterable<VoiceAudioChunk> {
      for (const chunk of session.chunks) yield chunk;
    }

    let finalText = '';
    for await (const event of engine.stream({ sessionId, config, chunks: chunks() })) {
      this.emitTranscript(event);
      if (event.type === 'partial') this.lastPartial = event.text;
      if (event.type === 'final') finalText = event.text || this.lastPartial;
      if (event.type === 'error') {
        this.setError(event.message);
        return;
      }
    }

    const audioRef = await this.audioCache.finalize(sessionId, session.mimeType);
    this.lastFinal = finalText;
    this.emitTranscript({ type: 'final', text: finalText, sessionId, audioRef: audioRef.relativeDir });
    this.active = null;
    this.setPhase('voice-idle', '语音识别完成');
  }

  async cancelSession(sessionId: string): Promise<void> {
    this.requireSession(sessionId);
    await this.audioCache.discard(sessionId);
    this.active = null;
    this.setPhase('voice-idle', '语音输入已取消');
  }

  getStatus(): VoiceInputDebugSnapshot {
    return {
      activeSessionId: this.active?.sessionId ?? null,
      phase: this.phase,
      lastPartial: this.lastPartial,
      lastFinal: this.lastFinal,
      lastError: this.lastError,
    };
  }

  private requireSession(sessionId: string): ActiveVoiceSession {
    if (!this.active || this.active.sessionId !== sessionId) {
      throw new Error(`No active voice input session: ${sessionId}`);
    }
    return this.active;
  }

  private setPhase(phase: VoiceInputPhase, message: string): void {
    this.phase = phase;
    this.mainWindow.webContents.send('voice-input-status', { phase, message, sessionId: this.active?.sessionId ?? null });
  }

  private setError(message: string): void {
    this.lastError = message;
    this.phase = 'voice-error';
    this.mainWindow.webContents.send('voice-input-status', { phase: 'voice-error', message, sessionId: this.active?.sessionId ?? null });
  }

  private emitTranscript(event: ASRTranscriptEvent): void {
    this.mainWindow.webContents.send('voice-input-transcript', event);
  }
}
