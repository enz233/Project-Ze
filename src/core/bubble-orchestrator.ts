import { BubbleManager } from './bubble-manager';

export type BubbleSource = 'chat' | 'proactive' | 'activity' | 'system';
export type BubblePriority = 'low' | 'normal' | 'high';

export interface BubbleRequest {
  text: string;
  source: BubbleSource;
  priority?: BubblePriority;
  ttlMs?: number;
}

export class BubbleOrchestrator {
  private bubbleManager: BubbleManager;

  constructor(bubbleManager: BubbleManager) {
    this.bubbleManager = bubbleManager;
  }

  show(request: BubbleRequest): boolean {
    const text = request.text.trim();
    if (!text) return false;
    this.bubbleManager.sendBubble(text);
    return true;
  }

  tryShowProactive(text: string, source: string = 'proactive'): boolean {
    const trimmed = text.trim();
    if (!trimmed) return false;
    return this.bubbleManager.tryShowProactiveBubble(trimmed, source);
  }
}
