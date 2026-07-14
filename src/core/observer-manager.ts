/**
 * 观察管理器
 *
 * 整合三层观察系统：
 * Layer 1: 轻量上下文收集（持续运行）
 * Layer 2: 截屏触发（条件触发）
 * Layer 3: LLM 上下文分析（结构化输出）
 */

import { BrowserWindow } from 'electron';
import { ContextCollector, ContextSnapshot } from './context-collector';
import { AIService, ChatMessage } from './ai-service';
import { EmotionSystem } from './emotion-system';
import { StateManager } from './state-manager';
import { AIMemory } from './ai-memory';
import { AIConfigManager } from './ai-config';
import { BubbleOrchestrator } from './bubble-orchestrator';
import { ProactiveCandidate, ProactiveReactionSystem } from './proactive-reaction-system';
import { MicroBehaviorManager } from './micro-behavior-manager';
import { getLogger } from './logger';
import { WindowActivityService } from './window-activity-service';

export class ObserverManager {
  private contextCollector: ContextCollector;
  private aiService: AIService;
  private emotionSystem: EmotionSystem;
  private stateManager: StateManager;
  private memory: AIMemory;
  private mainWindow: BrowserWindow;
  private bubbleOrchestrator: BubbleOrchestrator;
  private proactiveReactionSystem: ProactiveReactionSystem;
  private microBehaviorManager: MicroBehaviorManager;
  private collectTimer: ReturnType<typeof setInterval> | null = null;
  private isAnalyzing = false;

  private configManager: AIConfigManager;

  constructor(
    mainWindow: BrowserWindow,
    aiService: AIService,
    emotionSystem: EmotionSystem,
    stateManager: StateManager,
    memory: AIMemory,
    configManager: AIConfigManager,
    bubbleOrchestrator: BubbleOrchestrator,
    proactiveReactionSystem: ProactiveReactionSystem,
    microBehaviorManager: MicroBehaviorManager,
    activityService: WindowActivityService
  ) {
    this.mainWindow = mainWindow;
    this.aiService = aiService;
    this.emotionSystem = emotionSystem;
    this.stateManager = stateManager;
    this.memory = memory;
    this.configManager = configManager;
    this.bubbleOrchestrator = bubbleOrchestrator;
    this.proactiveReactionSystem = proactiveReactionSystem;
    this.microBehaviorManager = microBehaviorManager;
    this.contextCollector = new ContextCollector(activityService);
  }

  /** 启动观察系统 */
  start(intervalMs: number = 30000): void {
    if (this.collectTimer) return;
    this.collectTimer = setInterval(() => {
      this.collectAndAnalyze();
    }, intervalMs);
    console.log('[Observer] 观察系统已启动，间隔', intervalMs / 1000, '秒');
  }

  /** 停止观察系统 */
  stop(): void {
    if (this.collectTimer) {
      clearInterval(this.collectTimer);
      this.collectTimer = null;
    }
  }

  /** 记录用户活动（由外部调用） */
  recordActivity(): void {
    this.contextCollector.recordUserActivity();
  }

  /** 收集上下文并检查是否需要主动回应 */
  private async collectAndAnalyze(): Promise<void> {
    if (this.isAnalyzing) return;

    try {
      const snapshot = await this.contextCollector.collect();

      console.log('[Observer]', snapshot.windowTitle,
        '|', Math.round(snapshot.windowDuration) + 's',
        '| active:', snapshot.userActive);

      // 先判断候选，再记录应用使用；这样 isNewApp/isFrequentApp 看到的是进入当前窗口前的记忆。
      const proactiveDecision = this.proactiveReactionSystem.evaluateComponent(snapshot);
      const candidate = proactiveDecision.candidate;

      if (snapshot.processName) {
        this.memory.recordAppUsage(snapshot.processName);
      }
      if (!candidate) return;

      const behaviorResult = this.microBehaviorManager.performForCandidate(candidate);

      let shown = false;
      let text = '';
      if (behaviorResult.shouldShowBubble) {
        text = await this.resolveCandidateText(candidate, snapshot);
        if (text && behaviorResult.bubbleDelayMs > 0) {
          await this.delay(behaviorResult.bubbleDelayMs);
        }
        if (text) {
          shown = this.bubbleOrchestrator.tryShowProactive(text, candidate.reason);
        }
      }

      if (shown || behaviorResult.performed) {
        this.proactiveReactionSystem.markDelivered(candidate, text || candidate.message);
      } else {
        getLogger().log('observer', `[Proactive] output blocked: ${candidate.reason}`);
      }
    } catch (error) {
      console.error('[Observer] error:', error);
    }
  }

  private async resolveCandidateText(candidate: ProactiveCandidate, snapshot: ContextSnapshot): Promise<string> {
    if (!candidate.allowAIWording || !this.configManager.isValid()) {
      return candidate.message;
    }

    try {
      const generated = await this.generateReactionText(candidate, snapshot);
      if (!generated || generated === '.' || generated === '。') {
        return candidate.message;
      }
      return generated.slice(0, 30);
    } catch (error: any) {
      console.error('[Observer] proactive wording failed:', error?.message || error);
      return candidate.message;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async generateReactionText(candidate: ProactiveCandidate, snapshot: ContextSnapshot): Promise<string> {
    const emotionPrompt = this.emotionSystem.toPromptString();
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `你是 Ze，一个安静、温柔、有陪伴感的桌面伙伴。你只需要把一个已经通过本地规则允许的主动回应意图，改写成一句自然中文。
规则：
- 20到30个中文字符以内
- 不要像系统通知
- 不要命令用户
- 不要解释你的判断
- 语气轻、温柔、像陪在旁边
- 如果觉得不适合改写，只回复英文句号"."`,
      },
      {
        role: 'user',
        content: `事件：${candidate.reason}
当前窗口：${snapshot.windowTitle}
应用：${snapshot.processName || '未知'}
停留：${Math.round(snapshot.windowDuration)}秒
当前情绪：${emotionPrompt || '平静'}
关系：${this.memory.getRelationshipPrompt()}
生活习惯：${this.memory.getLifePatternPrompt() || '暂无'}
本地文案：${candidate.message}`,
      },
    ];

    const response = await this.aiService.chat(messages);
    return response.trim();
  }


}
