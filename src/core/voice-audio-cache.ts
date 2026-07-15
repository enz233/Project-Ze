import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { ASRCacheConfig } from './asr-config';
import { VoiceAudioChunk } from './asr-engine';

export interface VoiceAudioRef {
  sessionId: string;
  relativeDir: string;
  mimeType: string;
  totalBytes: number;
  finalizedAt: number;
}

export interface VoiceAudioCacheEntry {
  sessionId: string;
  dir: string;
  createdAt: number;
  totalBytes: number;
}

export function createVoiceAudioRefPath(sessionId: string, sequence: number): string {
  return `voice-input/${sessionId}/chunk-${String(sequence).padStart(6, '0')}.webm`;
}

export class VoiceAudioCache {
  private rootDir: string;
  private sessions = new Map<string, VoiceAudioCacheEntry>();

  constructor(private config: ASRCacheConfig) {
    this.rootDir = path.join(app.getPath('userData'), 'cache', 'voice-input');
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  updateConfig(config: ASRCacheConfig): void {
    this.config = config;
  }

  async createSession(sessionId: string): Promise<VoiceAudioCacheEntry> {
    const dir = path.join(this.rootDir, sessionId);
    fs.mkdirSync(dir, { recursive: true });
    const entry = { sessionId, dir, createdAt: Date.now(), totalBytes: 0 };
    this.sessions.set(sessionId, entry);
    return entry;
  }

  async appendChunk(sessionId: string, chunk: VoiceAudioChunk): Promise<void> {
    if (!this.config.enabled) return;
    const entry = this.sessions.get(sessionId) ?? await this.createSession(sessionId);
    const bytes = Buffer.from(chunk.base64, 'base64');
    if (entry.totalBytes + bytes.byteLength > this.config.maxSessionBytes) {
      throw new Error('Voice audio cache session exceeded maxSessionBytes');
    }
    const filePath = path.join(entry.dir, `chunk-${String(chunk.sequence).padStart(6, '0')}.webm`);
    fs.writeFileSync(filePath, bytes);
    entry.totalBytes += bytes.byteLength;
  }

  async finalize(sessionId: string, mimeType = 'audio/webm'): Promise<VoiceAudioRef> {
    const entry = this.sessions.get(sessionId) ?? await this.createSession(sessionId);
    return {
      sessionId,
      relativeDir: `voice-input/${sessionId}`,
      mimeType,
      totalBytes: entry.totalBytes,
      finalizedAt: Date.now(),
    };
  }

  async discard(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (entry && fs.existsSync(entry.dir)) {
      fs.rmSync(entry.dir, { recursive: true, force: true });
    }
    this.sessions.delete(sessionId);
  }

  async cleanupExpired(): Promise<void> {
    const cutoff = Date.now() - this.config.retentionMinutes * 60 * 1000;
    for (const entry of fs.readdirSync(this.rootDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(this.rootDir, entry.name);
      const stat = fs.statSync(dir);
      if (stat.mtimeMs < cutoff) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  }
}
