import * as fs from 'fs';
import * as path from 'path';
import { ChatMessage } from './ai-service';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface HistoryData {
  messages: HistoryMessage[];
  sinceLastSummary: number;
}

export class ChatHistoryStore {
  private historyPath: string;
  private history: HistoryData;

  constructor(configDir: string) {
    this.historyPath = path.join(configDir, 'chat-history.json');
    this.history = this.load();
  }

  getData(): HistoryData {
    return this.history;
  }

  setData(data: HistoryData): void {
    this.history = data;
  }

  addMessage(role: 'user' | 'assistant', content: string): void {
    this.history.messages.push({
      role,
      content,
      timestamp: Date.now(),
    });
    this.history.sinceLastSummary++;
    this.save();
  }

  getRecentMessages(count: number): ChatMessage[] {
    const messages = this.history.messages;
    const start = Math.max(0, messages.length - count);
    return messages.slice(start).map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  getHistoryCount(): number {
    return this.history.messages.length;
  }

  shouldSummarize(threshold: number): boolean {
    return this.history.sinceLastSummary >= threshold;
  }

  resetSinceLastSummary(): void {
    this.history.sinceLastSummary = 0;
  }

  save(): void {
    try {
      const dir = path.dirname(this.historyPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2), 'utf-8');
    } catch (e) {
      console.error('[AIMemory] 保存历史失败:', e);
    }
  }

  private load(): HistoryData {
    try {
      if (fs.existsSync(this.historyPath)) {
        const raw = fs.readFileSync(this.historyPath, 'utf-8');
        const data = JSON.parse(raw);
        return {
          messages: Array.isArray(data.messages) ? data.messages : [],
          sinceLastSummary: data.sinceLastSummary || 0,
        };
      }
    } catch (e) {
      console.error('[AIMemory] 加载历史失败:', e);
    }
    return { messages: [], sinceLastSummary: 0 };
  }
}
