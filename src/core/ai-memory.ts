import * as fs from 'fs';
import * as path from 'path';
import { ChatMessage } from './ai-service';
import { ChatHistoryStore, HistoryData } from './chat-history-store';


interface AppUsage {
  count: number;        // 使用次数
  lastSeen: number;     // 最后使用时间
  description: string;  // Vision API 返回的描述（可选）
}

interface InteractionStats {
  count: number;                  // 该类互动累计次数
  firstAt: number;                // 第一次发生时间
  lastAt: number;                 // 最近发生时间
  byHour: Record<string, number>; // 按小时粗略记录习惯
}

interface InteractionRecord {
  type: string;                   // chat / drag / click / app 等
  detail: string;                 // 简短描述，避免存隐私长文本
  timestamp: number;
  state?: string;
}

interface MemoryData {
  summary: string;
  lastUpdated: number;
  totalMessages: number;
  appUsage: Record<string, AppUsage>;
  affection: number;              // 好感度 0-100
  familiarity: number;            // 熟悉度 0-100
  affectionUpdated: number;       // 上次好感度更新时间
  familiarityUpdated: number;     // 上次熟悉度更新时间
  firstSeen: number;              // 首次使用时间
  totalInteractions: number;      // 总互动次数
  todayInteractions: number;      // 今日互动次数
  todayDate: string;              // 今日日期（用于重置每日计数）
  interactionStats: Record<string, InteractionStats>; // 轻量互动习惯
  recentInteractions: InteractionRecord[];            // 最近互动轨迹
}

const SUMMARY_THRESHOLD = 50;
const SUMMARY_REQUEST_COUNT = 20;
const MAX_SUMMARY_LENGTH = 200;
const MAX_RECENT_INTERACTIONS = 40;

export class AIMemory {
  private historyStore: ChatHistoryStore;
  private memoryPath: string;
  private memory: MemoryData;

  constructor(configDir: string) {
    this.historyStore = new ChatHistoryStore(configDir);
    this.memoryPath = path.join(configDir, 'ai-memory.json');
    this.memory = this.loadMemory();
  }

  // ========== 持久化 ==========

  saveHistory(): void {
    this.historyStore.save();
  }

  private loadMemory(): MemoryData {
    try {
      if (fs.existsSync(this.memoryPath)) {
        const raw = fs.readFileSync(this.memoryPath, 'utf-8');
        const data = JSON.parse(raw);
        return this.normalizeMemoryData(data);
      }
    } catch (e) {
      console.error('[AIMemory] 加载记忆失败:', e);
    }
    return this.createDefaultMemory();
  }

  private createDefaultMemory(): MemoryData {
    return {
      summary: '',
      lastUpdated: 0,
      totalMessages: 0,
      appUsage: {},
      affection: 50,
      familiarity: 10,
      affectionUpdated: 0,
      familiarityUpdated: 0,
      firstSeen: Date.now(),
      totalInteractions: 0,
      todayInteractions: 0,
      todayDate: '',
      interactionStats: {},
      recentInteractions: [],
    };
  }

  /** 兼容旧版本记忆文件，避免缺字段导致运行期报错 */
  private normalizeMemoryData(data: Partial<MemoryData>): MemoryData {
    const defaults = this.createDefaultMemory();
    return {
      ...defaults,
      ...data,
      appUsage: data.appUsage && typeof data.appUsage === 'object' ? data.appUsage : {},
      interactionStats: data.interactionStats && typeof data.interactionStats === 'object' ? data.interactionStats : {},
      recentInteractions: Array.isArray(data.recentInteractions) ? data.recentInteractions.slice(-MAX_RECENT_INTERACTIONS) : [],
      affection: typeof data.affection === 'number' ? data.affection : defaults.affection,
      familiarity: typeof data.familiarity === 'number' ? data.familiarity : defaults.familiarity,
      firstSeen: typeof data.firstSeen === 'number' ? data.firstSeen : defaults.firstSeen,
      todayDate: typeof data.todayDate === 'string' ? data.todayDate : defaults.todayDate,
    };
  }

  saveMemory(): void {
    try {
      const dir = path.dirname(this.memoryPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.memoryPath, JSON.stringify(this.memory, null, 2), 'utf-8');
    } catch (e) {
      console.error('[AIMemory] 保存记忆失败:', e);
    }
  }

  // ========== 历史操作 ==========

  addMessage(role: 'user' | 'assistant', content: string): void {
    this.historyStore.addMessage(role, content);
    this.memory.totalMessages++;
  }

  getRecentMessages(count: number): ChatMessage[] {
    return this.historyStore.getRecentMessages(count);
  }

  getHistoryCount(): number {
    return this.historyStore.getHistoryCount();
  }

  clearAll(): void {
    this.historyStore.setData({ messages: [], sinceLastSummary: 0 });
    this.memory = this.createDefaultMemory();
    this.saveHistory();
    this.saveMemory();
  }

  // ========== 摘要 ==========

  shouldSummarize(): boolean {
    return this.historyStore.shouldSummarize(SUMMARY_THRESHOLD);
  }

  buildSummaryMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 系统提示
    messages.push({
      role: 'system',
      content: `你是一个对话摘要助手。请用中文总结以下对话的要点，${MAX_SUMMARY_LENGTH}字以内。

总结要求：
- 只记录有价值的信息，忽略闲聊
- 用户的偏好、习惯、重要信息
- 对话中提到的人或事
- 不要记录屏幕分析的详细内容
- 用简洁的条目式总结
- 不要加开场白或结尾语`,
    });

    // 旧记忆（如果有）
    if (this.memory.summary) {
      messages.push({
        role: 'system',
        content: '之前的记忆：\n' + this.memory.summary,
      });
    }

    // 最近 N 条对话
    const recent = this.getRecentMessages(SUMMARY_REQUEST_COUNT);
    const conversationText = recent.map(m =>
      (m.role === 'user' ? '用户：' : '助手：') + m.content
    ).join('\n');
    messages.push({
      role: 'user',
      content: '[对话记录]\n' + conversationText,
    });

    return messages;
  }

  applySummary(summary: string): void {
    if (!summary || !summary.trim()) return;
    this.memory.summary = summary.trim();
    this.memory.lastUpdated = Date.now();
    this.historyStore.resetSinceLastSummary();
    this.saveMemory();
    this.saveHistory();
    console.log('[AIMemory] 记忆摘要已更新');
  }

  getSummary(): string {
    return this.memory.summary;
  }

  // ========== 应用使用记录 ==========

  /** 记录应用使用 */
  recordAppUsage(appName: string, description?: string): void {
    if (!appName) return;
    const existing = this.memory.appUsage[appName];
    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
      if (description) existing.description = description;
    } else {
      this.memory.appUsage[appName] = {
        count: 1,
        lastSeen: Date.now(),
        description: description || '',
      };
    }
    this.saveMemory();
  }

  /** 获取应用使用记录 */
  getAppUsage(appName: string): AppUsage | undefined {
    return this.memory.appUsage[appName];
  }

  /** 获取所有应用使用记录 */
  getAllAppUsage(): Record<string, AppUsage> {
    return this.memory.appUsage;
  }

  /** 判断是否为常用应用（5次以上） */
  isFrequentApp(appName: string): boolean {
    const usage = this.memory.appUsage[appName];
    return usage ? usage.count >= 5 : false;
  }

  /** 判断是否为新应用 */
  isNewApp(appName: string): boolean {
    return !this.memory.appUsage[appName];
  }

  // ========== 注入 ==========

  /** 构建三层提示词 */
  buildSystemPrompt(
    personalityPrompt: string,
    formatPrompt: string,
    statusPrompt?: string
  ): string {
    let parts: string[] = [];

    // 第一层：人格（最重要）
    parts.push('【以下是你的人格设定】\n' + personalityPrompt);

    // 回复格式
    parts.push('【回复格式要求】\n' + formatPrompt);

    // 第二层：记忆
    if (this.memory.summary) {
      parts.push('【以下是你之前和用户的记忆】\n' + this.memory.summary);
    }

    // 第三层：当前状态
    if (statusPrompt) {
      parts.push('【以下是你现在的状态】\n' + statusPrompt);
    }

    const lifePatternPrompt = this.getLifePatternPrompt();
    if (lifePatternPrompt) {
      parts.push('【以下是你观察到的轻量生活习惯】\n' + lifePatternPrompt);
    }

    return parts.join('\n\n');
  }

  /** 启动时总结上下文成记忆（合并旧记忆+新对话） */
  async summarizeOnStartup(aiService: any): Promise<void> {
    if (this.getHistoryCount() < 5) return;

    console.log('[AIMemory] startup: summarizing history...');
    try {
      const summaryMessages = this.buildSummaryMessages();
      const summary = await aiService.chat(summaryMessages);
      if (summary && summary.trim()) {
        this.applySummary(summary);
        console.log('[AIMemory] startup summary done');
      }
    } catch (e) {
      console.error('[AIMemory] startup summary failed:', e);
    }
  }

  /** 关闭时总结（快速，不等待太久） */
  async summarizeOnShutdown(aiService: any): Promise<void> {
    if (this.getHistoryCount() < 5) return;
    if (!this.historyStore.shouldSummarize(5)) return; // 最近已经总结过，跳过

    console.log('[AIMemory] shutdown: summarizing...');
    try {
      const summaryMessages = this.buildSummaryMessages();
      const summary = await aiService.chat(summaryMessages);
      if (summary && summary.trim()) {
        this.applySummary(summary);
        console.log('[AIMemory] shutdown summary done');
      }
    } catch (e) {
      console.error('[AIMemory] shutdown summary failed:', e);
    }
  }

  // ========== 好感度与熟悉度 ==========

  /** 修改好感度（钳位 0-100） */
  changeAffection(delta: number): void {
    // 冷却检查：一分钟内不重复变化
    const now = Date.now();
    if (now - this.memory.affectionUpdated < 60000) return;
    this.memory.affectionUpdated = now;

    // 好感度曲线：越高越难涨，越低越难掉
    const aff = this.memory.affection;
    let adjusted = delta;
    if (delta > 0 && aff > 70) adjusted *= 0.7;
    if (delta > 0 && aff < 30) adjusted *= 1.5;
    if (delta < 0 && aff < 30) adjusted *= 0.7;
    if (delta < 0 && aff > 70) adjusted *= 1.5;

    this.memory.affection = Math.max(0, Math.min(100, aff + adjusted));
    this.saveMemory();
  }

  /** 修改熟悉度（只增不减，钳位 0-100） */
  changeFamiliarity(delta: number): void {
    if (delta <= 0) return; // 只增
    const now = Date.now();
    if (now - this.memory.familiarityUpdated < 60000) return;
    this.memory.familiarityUpdated = now;

    this.memory.familiarity = Math.min(100, this.memory.familiarity + delta);
    this.saveMemory();
  }

  /** 获取好感度标签 */
  private affectionLabel(): string {
    const a = this.memory.affection;
    if (a <= 20) return '疏远';
    if (a <= 40) return '一般';
    if (a <= 60) return '友好';
    if (a <= 80) return '亲近';
    return '亲密';
  }

  /** 获取熟悉度标签 */
  private familiarityLabel(): string {
    const f = this.memory.familiarity;
    if (f <= 15) return '陌生人';
    if (f <= 40) return '认识';
    if (f <= 70) return '朋友';
    return '老友';
  }

  /** 记录互动 */
  recordInteraction(type: string = 'interaction', detail: string = '', state?: string): void {
    this.memory.totalInteractions++;

    const now = Date.now();
    const today = new Date(now).toDateString();
    if (this.memory.todayDate !== today) {
      this.memory.todayDate = today;
      this.memory.todayInteractions = 0;
    }
    this.memory.todayInteractions++;

    const hour = new Date(now).getHours().toString().padStart(2, '0');
    const existing = this.memory.interactionStats[type];
    if (existing) {
      existing.count++;
      existing.lastAt = now;
      existing.byHour[hour] = (existing.byHour[hour] || 0) + 1;
    } else {
      this.memory.interactionStats[type] = {
        count: 1,
        firstAt: now,
        lastAt: now,
        byHour: { [hour]: 1 },
      };
    }

    this.memory.recentInteractions.push({
      type,
      detail: detail.slice(0, 80),
      timestamp: now,
      state,
    });
    if (this.memory.recentInteractions.length > MAX_RECENT_INTERACTIONS) {
      this.memory.recentInteractions = this.memory.recentInteractions.slice(-MAX_RECENT_INTERACTIONS);
    }

    this.saveMemory();
  }

  /** 获取轻量生活习惯提示词 */
  getLifePatternPrompt(): string {
    const stats = this.memory.interactionStats || {};
    const recent = this.memory.recentInteractions || [];
    const parts: string[] = [];

    const chatCount = stats.chat?.count || 0;
    const dragCount = stats.drag?.count || 0;
    const clickCount = stats.click?.count || 0;
    if (chatCount || dragCount || clickCount) {
      parts.push(`累计互动：聊天${chatCount}次，拖拽${dragCount}次，点击${clickCount}次`);
    }

    const topApps = Object.entries(this.memory.appUsage || {})
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([name, usage]) => `${name}(${usage.count}次)`);
    if (topApps.length > 0) {
      parts.push('常见活动：' + topApps.join('、'));
    }

    const recentBrief = recent.slice(-5).map(item => {
      const detail = item.detail ? `:${item.detail}` : '';
      return `${item.type}${detail}`;
    });
    if (recentBrief.length > 0) {
      parts.push('最近互动：' + recentBrief.join('，'));
    }

    return parts.join('\n');
  }

  /** 获取公开记忆快照，用于调试窗口或设置面板 */
  getMemorySnapshot(): Readonly<MemoryData> {
    return this.memory;
  }

  /** 获取关系状态提示词 */
  getRelationshipPrompt(): string {
    const aff = this.memory.affection;
    const fam = this.memory.familiarity;
    const days = Math.floor((Date.now() - (this.memory.firstSeen || Date.now())) / 86400000) || 1;

    return `对你的好感度：${Math.round(aff)}/100（${this.affectionLabel()}）
对你的熟悉度：${Math.round(fam)}/100（${this.familiarityLabel()}）
认识时间：约${days}天
今日互动：${this.memory.todayInteractions}次`;
  }

  /** 初始化关系（首次运行时调用） */
  initRelationship(): void {
    const now = Date.now();
    if (!this.memory.firstSeen) {
      this.memory.firstSeen = now;
    }
    if (!this.memory.affection) {
      this.memory.affection = 50;
    }
    if (!this.memory.familiarity) {
      // 根据历史消息数计算初始熟悉度
      const base = Math.min(Math.floor(this.getHistoryCount() / 100) * 5, 20);
      this.memory.familiarity = Math.max(10, base);
    }
    this.memory.todayDate = new Date().toDateString();
    this.saveMemory();
  }
}
