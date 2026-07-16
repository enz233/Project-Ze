import { app, BrowserWindow, ipcMain, screen, shell } from 'electron';
import * as path from 'path';
import { StateManager } from '../core/state-manager';
import { TimeAwareness } from '../core/time-awareness';
import { TransitionEngine } from '../core/transition-engine';
import { BubbleManager } from '../core/bubble-manager';
import { BubbleOrchestrator } from '../core/bubble-orchestrator';
import { AIConfigManager } from '../core/ai-config';
import { AIService } from '../core/ai-service';
import { ChatManager } from '../core/chat-manager';
import { getLogger } from '../core/logger';
import { AppearanceConfigManager } from '../core/appearance-config';
import { ScreenAnalyzer } from '../core/screen-analyzer';
import { TTSConfigManager } from '../core/tts-config';
import { TTSManager } from '../core/tts-manager';
import { ASRConfigManager } from '../core/asr-config';
import { VoiceAudioCache } from '../core/voice-audio-cache';
import { VoiceInputManager } from '../core/voice-input-manager';
import { ObserverManager } from '../core/observer-manager';
import { ProactiveReactionSystem } from '../core/proactive-reaction-system';
import { MicroBehaviorManager } from '../core/micro-behavior-manager';
import { WindowActivityService } from '../core/window-activity-service';
import { MoveController, MoveToRequest } from '../core/move-controller';
import { ScreenTargetPointer } from '../core/screen-target-pointer';
import { CameraAwarenessConfigManager } from '../core/camera-awareness-config';
import { CameraAwarenessBackgroundRunner } from '../core/camera-awareness-background-runner';
import { CameraAwarenessManager } from '../core/camera-awareness-manager';
import { CAMERA_AWARENESS_IPC, CameraAwarenessSnapshot, CameraFrameInput } from '../core/camera-awareness-types';
import { VisionImageAnalyzer } from '../core/vision-image-analyzer';
import { IntentRouter } from '../core/intent-router';
import { IntentClassifier } from '../core/intent-classifier';
import { IntentExecutor } from '../core/intent-executor';
import { ResponseWorkflowOrchestrator } from '../core/response-workflow-orchestrator';
import { testFunASRLocalConnection } from '../core/asr-funasr-local';
import { WorkflowExecutionResult } from '../core/response-workflow-types';

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let debugWindow: BrowserWindow | null = null;
let stateManager: StateManager;
let timeAwareness: TimeAwareness;
let transitionEngine: TransitionEngine;
let bubbleManager: BubbleManager;
let bubbleOrchestrator: BubbleOrchestrator;
let aiConfigManager: AIConfigManager;
let aiService: AIService;
let chatManager: ChatManager;
let appearanceConfig: AppearanceConfigManager;
let screenAnalyzer: ScreenAnalyzer;
let ttsConfigManager: TTSConfigManager;
let ttsManager: TTSManager;
let asrConfigManager: ASRConfigManager;
let voiceAudioCache: VoiceAudioCache;
let voiceInputManager: VoiceInputManager;
let observerManager: ObserverManager;
let proactiveReactionSystem: ProactiveReactionSystem;
let microBehaviorManager: MicroBehaviorManager;
let windowActivityService: WindowActivityService;
let moveController: MoveController;
let screenTargetPointer: ScreenTargetPointer;
let cameraAwarenessConfigManager: CameraAwarenessConfigManager;
let visionImageAnalyzer: VisionImageAnalyzer;
let cameraAwarenessManager: CameraAwarenessManager;
let cameraAwarenessBackgroundRunner: CameraAwarenessBackgroundRunner;
let cameraAnalysisRequestSeq = 0;
const pendingCameraAnalysisRequests = new Map<string, {
  prompt: string;
  resolve: (message: string) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();
let cameraBackgroundFrameRequestSeq = 0;
const pendingCameraBackgroundFrameRequests = new Map<string, {
  resolve: (frame: CameraFrameInput) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();
let intentRouter: IntentRouter;
let intentExecutor: IntentExecutor;
let responseWorkflowOrchestrator: ResponseWorkflowOrchestrator;

// 拖拽状态（主进程端）
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let lastCursorX = 0;
let lastCursorY = 0;
let dragPollTimer: ReturnType<typeof setInterval> | null = null;

function createWindow(): void {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 250,
    height: 280,
    x: screenWidth - 270,
    y: screenHeight - 270,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 默认穿透，鼠标进入角色时恢复交互
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.loadFile(path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html'));

  // F12 打开 DevTools，F11 打开设置，F3 打开调试窗口
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
    if (input.key === 'F11' && input.type === 'keyDown') {
      createSettingsWindow();
    }
    if (input.key === 'F3' && input.type === 'keyDown') {
      toggleDebugWindow();
    }
  });

  // 发送精灵图路径给渲染进程
  const spritesPath = path.join(__dirname, '..', '..', 'src', 'assets', 'sprites');
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('sprites-path', spritesPath);
  });

  // 初始化核心模块
  stateManager = new StateManager();
  timeAwareness = new TimeAwareness(stateManager.getConfig());
  transitionEngine = new TransitionEngine(stateManager, timeAwareness);

  // 状态变化时通知渲染进程
  stateManager.onStateChange((event) => {
    mainWindow?.webContents.send('state-changed', event);
  });

  // 启动转移引擎
  transitionEngine.start(1000);

  // 初始化气泡管理器
  windowActivityService = new WindowActivityService();
  bubbleManager = new BubbleManager(mainWindow, timeAwareness, stateManager, windowActivityService);
  bubbleOrchestrator = new BubbleOrchestrator(bubbleManager);
  // 延迟发送问候语（等渲染进程就绪）
  setTimeout(() => {
    bubbleManager.showGreeting();
    // AI 问候（延迟等固定问候显示完）
    chatManager?.sendGreeting();
  }, 1500);
  // 启动活动监视（每45秒检测一次）
  bubbleManager.startActivityMonitor(45000);

  // 初始化 AI 模块
  aiConfigManager = new AIConfigManager();
  aiService = new AIService(aiConfigManager);
  screenAnalyzer = new ScreenAnalyzer(aiConfigManager);
  visionImageAnalyzer = new VisionImageAnalyzer(aiConfigManager);
  cameraAwarenessConfigManager = new CameraAwarenessConfigManager();
  cameraAwarenessManager = new CameraAwarenessManager(
    cameraAwarenessConfigManager,
    visionImageAnalyzer,
    { bubbleOrchestrator }
  );
  cameraAwarenessBackgroundRunner = new CameraAwarenessBackgroundRunner({
    getConfig: () => cameraAwarenessManager?.getConfig(),
    requestFrame: () => requestCameraBackgroundFrame(),
    processFrame: async (frame) => {
      const snapshot = await cameraAwarenessManager.processBackgroundFrame(frame);
      logCameraAwarenessDebug(snapshot, frame);
      return snapshot;
    },
    recordError: (error: Error) => {
      const snapshot = cameraAwarenessManager?.recordBackgroundError(error.message || String(error));
      logCameraAwarenessCaptureError(error, snapshot);
      getLogger().log('observer', `[CameraAwareness] background capture failed: ${error.message || String(error)}`);
    },
  });
  cameraAwarenessBackgroundRunner.sync();
  intentRouter = new IntentRouter({
    classifier: new IntentClassifier(),
    cameraEnabled: () => Boolean(cameraAwarenessManager?.getConfig()?.enabled),
  });
  chatManager = new ChatManager(mainWindow, aiConfigManager, aiService, stateManager, timeAwareness, screenAnalyzer);
  chatManager.setCameraPromptAnalyzer((prompt) => requestCameraPromptAnalysis(prompt));
  appearanceConfig = new AppearanceConfigManager();
  ttsConfigManager = new TTSConfigManager();
  ttsManager = new TTSManager(mainWindow, ttsConfigManager);
  asrConfigManager = new ASRConfigManager();
  voiceAudioCache = new VoiceAudioCache(asrConfigManager.get().cache);
  voiceInputManager = new VoiceInputManager(mainWindow, asrConfigManager, voiceAudioCache);
  moveController = new MoveController(mainWindow, {
    sendVisual: (event) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('move-visual', event);
      }
    },
  });
  screenTargetPointer = new ScreenTargetPointer({
    mainWindow,
    screenAnalyzer,
    moveController,
    bubbleOrchestrator,
    windowActivityService,
  });
  chatManager.setScreenTargetPointer(screenTargetPointer);
  responseWorkflowOrchestrator = new ResponseWorkflowOrchestrator({
    screenAnalyzer,
    screenTargetPointer,
    cameraTools: {
      checkPresence: async () => {
        const frame = await requestCameraIntentFrame();
        return await cameraAwarenessManager.detectOnce(frame);
      },
      analyzeVisualQuery: async (userPrompt: string) => {
        const frame = await requestCameraIntentFrame();
        return await visionImageAnalyzer.analyzeCameraVisualQuery(frame, userPrompt);
      },
    },
    chatResponder: chatManager,
  });
  chatManager.setResponseWorkflowOrchestrator(responseWorkflowOrchestrator);
  intentExecutor = new IntentExecutor({
    screenSummary: async (routed) => {
      const prompt = routed.request.text || '请总结当前屏幕';
      const result = await responseWorkflowOrchestrator.run({
        workflow: 'screen_summary_response',
        source: routed.request.source === 'voice_asr' ? 'voice_asr' : 'text_chat',
        userText: routed.request.text || prompt,
        toolText: prompt,
      });
      return workflowResultToIntentResult(result);
    },
    screenTargetPointer: async (routed) => {
      const target = routed.decision.target || routed.request.text || '';
      const pointerMessage = routed.request.text || target;
      const result = await responseWorkflowOrchestrator.run({
        workflow: 'screen_target_pointer_response',
        source: routed.request.source === 'voice_asr' ? 'voice_asr' : 'text_chat',
        userText: routed.request.text || pointerMessage,
        toolText: pointerMessage,
      });
      return workflowResultToIntentResult(result);
    },
    cameraCheckOnce: async (routed) => {
      const prompt = routed.request.text || '看看我在不在';
      const result = await responseWorkflowOrchestrator.run({
        workflow: 'camera_check_once_response',
        source: routed.request.source === 'voice_asr' ? 'voice_asr' : 'text_chat',
        userText: routed.request.text || prompt,
        toolText: prompt,
      });
      return workflowResultToIntentResult(result);
    },
    cameraVisualQuery: async (routed) => {
      const userPrompt = routed.request.text || '请看一下摄像头画面。';
      const result = await responseWorkflowOrchestrator.run({
        workflow: 'camera_visual_query_response',
        source: routed.request.source === 'voice_asr' ? 'voice_asr' : 'text_chat',
        userText: userPrompt,
        toolText: userPrompt,
      });
      return workflowResultToIntentResult(result);
    },
    voiceInputHelp: async () => ({
      status: 'handled',
      message: '请检查语音输入是否启用、API Key/Base URL/模型是否已配置，并查看 Debug 日志中的 voice-input 状态。',
    }),
    proactiveExplain: async () => ({
      status: 'handled',
      message: '可以在 Debug 面板查看最近主动回应和 Intent Router 决策。',
    }),
    proactiveControl: async () => ({
      status: 'skipped',
      message: '主动提醒开关需要二次确认后写入配置，本轮不静默修改。',
    }),
  });
  chatManager.setIntentRouter(intentRouter, intentExecutor);

  // 连接情绪系统到 TransitionEngine
  transitionEngine.setEmotionUpdater(chatManager.getEmotionUpdater());

  // 连接拖拽到好感度变化
  transitionEngine.setOnRelationshipChange((delta) => {
    chatManager?.changeAffection(delta);
  });

  // 连接 TTS 到 ChatManager，并提供 AI 服务用于翻译
  ttsManager.setAIService(aiService);
  chatManager.setTTSManager(ttsManager);

  // 初始化观察系统
  proactiveReactionSystem = new ProactiveReactionSystem(chatManager.getMemory());
  microBehaviorManager = new MicroBehaviorManager(mainWindow);
  observerManager = new ObserverManager(
    mainWindow, aiService, chatManager.getEmotionUpdater().getEmotionSystem(),
    stateManager, chatManager.getMemory(), aiConfigManager,
    bubbleOrchestrator, proactiveReactionSystem, microBehaviorManager,
    windowActivityService
  );
  observerManager.start(30000); // 每30秒检查一次

  // 定时发送当前状态给渲染进程（用于UI更新）
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const currentState = stateManager.getCurrentState();
      const stateDef = stateManager.getStateDefinition(currentState);
      mainWindow.webContents.send('state-update', {
        state: currentState,
        definition: stateDef,
        stateDuration: stateManager.getStateDuration(),
        timeSlot: timeAwareness.getCurrentTimeSlot(),
      });
    }
  }, 500);

}

/** 注册所有 IPC 监听器（只调用一次） */
function setupIPC(): void {
  ipcMain.on('cursor-move', (_event, data: { x: number; y: number }) => {
    if (!mainWindow || !transitionEngine) return;
    const bounds = mainWindow.getBounds();
    const companionPos = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    transitionEngine.handleCursorMove(data, companionPos);
    observerManager?.recordActivity();
  });

  ipcMain.on('drag-start', () => {
    transitionEngine?.handleDragStart();
    moveController?.cancel('drag-start');
    screenTargetPointer?.cancel('drag-start');
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const [winX, winY] = mainWindow.getPosition();
    dragOffsetX = cursor.x - winX;
    dragOffsetY = cursor.y - winY;
    lastCursorX = cursor.x;
    lastCursorY = cursor.y;
    isDragging = true;
    if (dragPollTimer) clearInterval(dragPollTimer);
    dragPollTimer = setInterval(() => {
      if (!isDragging || !mainWindow || mainWindow.isDestroyed()) {
        stopDragPoll();
        return;
      }
      const pos = screen.getCursorScreenPoint();
      if (pos.x !== lastCursorX || pos.y !== lastCursorY) {
        lastCursorX = pos.x;
        lastCursorY = pos.y;
        mainWindow.setPosition(pos.x - dragOffsetX, pos.y - dragOffsetY);
      }
    }, 16);
  });

  ipcMain.on('drag-end', () => {
    isDragging = false;
    stopDragPoll();
    transitionEngine?.handleDragEnd();
    chatManager?.recordInteraction('drag', 'end');
    proactiveReactionSystem?.recordDirectInteraction('drag', 'end');
  });

  ipcMain.on('user-click', () => {
    transitionEngine?.handleInteraction();
    observerManager?.recordActivity();
    chatManager?.recordInteraction('click', 'companion');
    proactiveReactionSystem?.recordDirectInteraction('click', 'companion');
  });

  ipcMain.on('lonely-action', (_event, active: boolean) => {
    transitionEngine?.setLonelyAction(active);
  });

  ipcMain.on('state-finished', () => {
    transitionEngine?.handleStateFinished();
  });

  ipcMain.on('window-move-by', (_event, data: { deltaX: number; deltaY: number }) => {
    if (!mainWindow || mainWindow.isDestroyed() || isDragging) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + data.deltaX, y + data.deltaY);
  });

  ipcMain.handle('move-to', async (_event, request: MoveToRequest) => {
    if (!moveController) {
      return { success: false, cancelled: false, finalPosition: { x: 0, y: 0 } };
    }
    if (isDragging) {
      return { success: false, cancelled: true, cancelReason: 'drag-start', finalPosition: getMainWindowPosition() };
    }
    return await moveController.moveTo(request);
  });

  ipcMain.handle('teleport-to', async (_event, request: MoveToRequest) => {
    if (!moveController) {
      return { success: false, cancelled: false, finalPosition: { x: 0, y: 0 } };
    }
    if (isDragging) {
      return { success: false, cancelled: true, cancelReason: 'drag-start', finalPosition: getMainWindowPosition() };
    }
    return moveController.teleportTo(request);
  });

  ipcMain.on('mouse-enter', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(false);
    }
  });

  ipcMain.on('mouse-leave', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  });

  ipcMain.on('user-message', (_event, text: string) => {
    proactiveReactionSystem?.recordDirectInteraction('chat', text.slice(0, 40));
    chatManager?.sendMessage(text);
  });

  ipcMain.on('open-settings', () => {
    createSettingsWindow();
  });

  ipcMain.handle('load-ai-config', () => {
    return aiConfigManager?.get();
  });

  ipcMain.on('save-ai-config', (_event, config: any) => {
    aiConfigManager?.update(config);
  });

  ipcMain.handle('test-ai-connection', async () => {
    if (!aiService) return { success: false, message: 'AI 服务未初始化' };
    try {
      const result = await aiService.testConnection();
      return result || { success: false, message: 'AI 服务未返回测试结果' };
    } catch (e: any) {
      return { success: false, message: '连接测试失败: ' + (e?.message || String(e)) };
    }
  });

  // 日志相关
  ipcMain.on('renderer-log', (_event, category: string, message: string) => {
    getLogger().log(category as any, message);
  });

  ipcMain.handle('get-log-path', () => {
    return getLogger().getLogPath();
  });

  ipcMain.handle('get-recent-logs', (_event, count: number) => {
    return getLogger().getRecentLines(count);
  });

  ipcMain.on('open-log-file', () => {
    shell.openPath(getLogger().getLogPath());
  });

  // 对话历史管理
  ipcMain.on('clear-chat-history', () => {
    chatManager?.clearHistory();
    console.log('[Main] 对话历史已清空');
  });

  ipcMain.handle('get-chat-info', () => {
    return {
      historyCount: chatManager?.getHistoryCount() || 0,
      summary: chatManager?.getSummary() || '',
      lifePattern: chatManager?.getMemory().getLifePatternPrompt() || '',
      memory: chatManager?.getMemory().getMemorySnapshot() || null,
      proactive: proactiveReactionSystem?.getDebugSnapshot() || null,
      microBehavior: microBehaviorManager?.getDebugSnapshot() || null,
    };
  });

  // 外观设置
  ipcMain.handle('load-appearance-config', () => {
    return appearanceConfig?.get();
  });

  ipcMain.on('save-appearance-config', (_event, config: any) => {
    appearanceConfig?.update(config);
  });

  ipcMain.on('apply-appearance', (_event, config: any) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    // 调整窗口大小
    const newSize = config.petSize || 200;
    mainWindow.setSize(newSize + 50, newSize + 80);
    // 设置透明度
    mainWindow.setOpacity(config.opacity ?? 1.0);
    // 通知渲染进程更新精灵图大小
    mainWindow.webContents.send('update-pet-size', newSize);
  });

  // 屏幕分析
  ipcMain.handle('test-screen-analysis', async () => {
    if (!screenAnalyzer) return { success: false, message: '屏幕分析服务未初始化' };
    try {
      const result = await screenAnalyzer.analyze('测试截屏分析');
      return { success: true, message: result };
    } catch (e: any) {
      return { success: false, message: '测试失败: ' + e.message };
    }
  });

  // 摄像头感知
  ipcMain.handle(CAMERA_AWARENESS_IPC.getConfig, () => {
    return cameraAwarenessManager?.getConfig();
  });

  ipcMain.handle(CAMERA_AWARENESS_IPC.updateConfig, (_event, partial: any) => {
    const updated = cameraAwarenessManager?.updateConfig(partial);
    cameraAwarenessBackgroundRunner?.sync();
    return updated;
  });

  ipcMain.handle(CAMERA_AWARENESS_IPC.detectOnce, async (_event, frame: CameraFrameInput) => {
    if (!cameraAwarenessManager) {
      return {
        presence: 'uncertain',
        confidence: 0,
        affect: 'unclear',
        reason: 'api_error',
        checkedAt: Date.now(),
      };
    }
    return await cameraAwarenessManager.detectOnce(frame);
  });

  ipcMain.handle(CAMERA_AWARENESS_IPC.processBackgroundFrame, async (_event, frame: CameraFrameInput) => {
    if (!cameraAwarenessManager) {
      return {
        status: 'unavailable',
        lastDetection: null,
        lastChangedAt: null,
        lastReturnedAt: null,
        backgroundDetectionRunning: false,
        lastError: 'camera_awareness_uninitialized',
      };
    }
    return await cameraAwarenessManager.processBackgroundFrame(frame);
  });

  ipcMain.handle(CAMERA_AWARENESS_IPC.submitBackgroundFrame, async (_event, payload: { requestId?: string; frame?: CameraFrameInput; error?: string }) => {
    const requestId = String(payload?.requestId || '');
    const pending = pendingCameraBackgroundFrameRequests.get(requestId);
    if (!pending) {
      return { ok: false, reason: 'background capture request expired' };
    }

    clearTimeout(pending.timeout);
    pendingCameraBackgroundFrameRequests.delete(requestId);

    if (payload?.error) {
      pending.reject(new Error(payload.error));
      return { ok: true };
    }

    if (!payload?.frame) {
      pending.reject(new Error('camera did not return a frame'));
      return { ok: true };
    }

    pending.resolve(payload.frame);
    return { ok: true };
  });

  ipcMain.handle(CAMERA_AWARENESS_IPC.getSnapshot, () => {
    return cameraAwarenessManager?.getSnapshot() ?? {
      status: 'unavailable',
      lastDetection: null,
      lastChangedAt: null,
      lastReturnedAt: null,
      backgroundDetectionRunning: false,
      lastError: 'camera_awareness_uninitialized',
    };
  });

  ipcMain.handle(CAMERA_AWARENESS_IPC.analyzePrompt, async (_event, payload: { requestId?: string; frame?: CameraFrameInput; error?: string }) => {
    const requestId = String(payload?.requestId || '');
    const pending = pendingCameraAnalysisRequests.get(requestId);
    if (!pending) {
      return { ok: false, reason: 'camera analysis request expired' };
    }

    clearTimeout(pending.timeout);
    pendingCameraAnalysisRequests.delete(requestId);

    if (payload?.error) {
      pending.resolve('摄像头没有打开。');
      return { ok: true };
    }

    if (!payload?.frame || !visionImageAnalyzer) {
      pending.resolve('摄像头没有返回可用画面。');
      return { ok: true };
    }

    const result = await visionImageAnalyzer.analyzeCameraPrompt(payload.frame, pending.prompt);
    pending.resolve(result);
    return { ok: true };
  });

  ipcMain.handle('intent-router:get-debug-snapshot', async () => {
    return intentRouter?.getDebugSnapshot() ?? { recent: [] };
  });

  // TTS 语音
  ipcMain.handle('load-tts-config', () => {
    return ttsConfigManager?.get();
  });

  ipcMain.on('save-tts-config', (_event, config: any) => {
    ttsConfigManager?.update(config);
  });

  ipcMain.handle('load-asr-config', () => {
    return asrConfigManager.get();
  });

  ipcMain.handle('save-asr-config', (_event, config: any) => {
    asrConfigManager.update(config);
    const updatedConfig = asrConfigManager.get();
    voiceAudioCache?.updateConfig(updatedConfig.cache);
    const windows = BrowserWindow.getAllWindows();
    console.log('[VoiceInput] ASR config saved', {
      enabled: updatedConfig.enabled,
      providerPreset: updatedConfig.providerPreset,
      provider: updatedConfig.provider,
      model: updatedConfig.model,
      windowCount: windows.length,
    });
    windows.forEach((window) => {
      window.webContents.send('asr-config-updated', updatedConfig);
    });
    return updatedConfig;
  });

  ipcMain.handle('test-asr-connection', async (_event, config: any) => {
    const current = asrConfigManager.get();
    const merged = { ...current, ...config };
    if (merged.provider === 'funasr-local-runtime') {
      return await testFunASRLocalConnection(merged);
    }
    return {
      success: false,
      message: '当前 ASR provider 暂不支持独立连接测试，请使用“测试语音识别 10 秒”。',
    };
  });

  ipcMain.handle('voice-input-start', async (event, options: any) => {
    return voiceInputManager.startSession(options, event.sender);
  });

  ipcMain.handle('voice-input-audio-chunk', async (_event, payload: any) => {
    await voiceInputManager.appendAudioChunk(payload.sessionId, payload.chunk);
  });

  ipcMain.handle('voice-input-stop', async (_event, sessionId: string) => {
    await voiceInputManager.stopSession(sessionId);
  });

  ipcMain.handle('voice-input-cancel', async (_event, sessionId: string) => {
    await voiceInputManager.cancelSession(sessionId);
  });

  ipcMain.handle('test-tts', async () => {
    return await ttsManager?.test();
  });

  ipcMain.on('tts-stop', () => {
    ttsManager?.stop();
  });
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 500,
    height: 600,
    title: '设置',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, '..', '..', 'src', 'main', 'settings.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
  // F12 打开 DevTools
  settingsWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      settingsWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });
}

function toggleDebugWindow(): void {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.close();
    return;
  }
  debugWindow = new BrowserWindow({
    width: 700,
    height: 500,
    title: 'Debug - Quiet Companion',
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  debugWindow.loadFile(path.join(__dirname, '..', '..', 'src', 'main', 'debug.html'));
  debugWindow.on('closed', () => {
    debugWindow = null;
    getLogger().setDebugWindow(null);
  });
  getLogger().setDebugWindow(debugWindow);
}

function stopDragPoll(): void {
  if (dragPollTimer) {
    clearInterval(dragPollTimer);
    dragPollTimer = null;
  }
}

function getMainWindowPosition(): { x: number; y: number } {
  if (!mainWindow || mainWindow.isDestroyed()) return { x: 0, y: 0 };
  const [x, y] = mainWindow.getPosition();
  return { x, y };
}

function workflowResultToIntentResult(result: WorkflowExecutionResult) {
  if (result.status === 'handled') {
    return {
      status: 'handled' as const,
      message: '',
      debug: {
        workflowFinalResponse: true,
        workflow: result.workflow,
        debugSummary: result.debugSummary,
      },
    };
  }

  return {
    status: 'failed' as const,
    message: result.fallbackMessage || '工作流执行失败了。',
    error: result.error,
    debug: {
      workflow: result.workflow,
      debugSummary: result.debugSummary,
    },
  };
}

function requestCameraPromptAnalysis(prompt: string): Promise<string> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.resolve('摄像头窗口还没有准备好。');
  }

  const requestId = `camera-analysis-${Date.now()}-${++cameraAnalysisRequestSeq}`;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingCameraAnalysisRequests.delete(requestId);
      resolve('摄像头没有及时回应。');
    }, 15000);

    pendingCameraAnalysisRequests.set(requestId, { prompt, resolve, timeout });
    mainWindow?.webContents.send('camera-analysis:capture-request', { requestId });
  });
}

function requestCameraBackgroundFrame(): Promise<CameraFrameInput> {
  return requestCameraFrame('background');
}

function requestCameraIntentFrame(): Promise<CameraFrameInput> {
  return requestCameraFrame('intent-command');
}

function requestCameraFrame(source: 'background' | 'intent-command'): Promise<CameraFrameInput> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return Promise.reject(new Error('camera window is not ready'));
  }

  const requestId = `camera-${source}-${Date.now()}-${++cameraBackgroundFrameRequestSeq}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCameraBackgroundFrameRequests.delete(requestId);
      reject(new Error(`${source} camera capture timed out`));
    }, 15000);

    pendingCameraBackgroundFrameRequests.set(requestId, { resolve, reject, timeout });
    const payload: Record<string, unknown> = { requestId, source };
    if (source === 'background') {
      payload.foregroundFaceGate = getCameraForegroundFaceGateRequestConfig();
    }
    mainWindow?.webContents.send(CAMERA_AWARENESS_IPC.backgroundCaptureRequest, payload);
  });
}

function getCameraForegroundFaceGateRequestConfig(): Record<string, unknown> {
  const config = cameraAwarenessManager?.getConfig();
  return {
    enabled: config?.foregroundFaceGateEnabled !== false,
    minHeightRatio: config?.foregroundFaceMinHeightRatio ?? 0.05,
    minAreaRatio: config?.foregroundFaceMinAreaRatio ?? 0.0012,
  };
}

function formatCameraCheckOnceMessage(presence: string, confidence: number, reason: string): string {
  const percent = formatCameraConfidence(confidence);
  if (presence === 'present') {
    return `我看到镜头里有人，置信度 ${percent}。`;
  }
  if (presence === 'absent') {
    return `这次没有看到镜头里有人，置信度 ${percent}。`;
  }
  return `这帧不太确定，原因是 ${reason || 'uncertain'}。`;
}

function logCameraAwarenessDebug(snapshot: CameraAwarenessSnapshot, frame?: CameraFrameInput): void {
  const detection = snapshot.lastDetection;
  const faceSummary = formatCameraFaceGateSummary(frame);
  const parts = [
    '[CameraAwareness]',
    'person:', formatCameraPerson(detection?.presence),
    '| state:', snapshot.status,
    '| reason:', detection?.reason ?? 'none',
    '| source:', frame?.source ?? 'unknown',
  ];
  if (faceSummary) {
    parts.push('| face:', faceSummary);
  }
  if (detection?.presence === 'present') {
    parts.push('| confidence:', formatCameraConfidence(detection.confidence));
  }
  console.log(...parts);
}

function formatCameraFaceGateSummary(frame?: CameraFrameInput): string {
  const gate = frame?.foregroundFaceGate;
  if (!gate || (gate.status !== 'passed' && gate.status !== 'blocked')) {
    return '';
  }

  const decision = gate.status === 'passed' ? 'yes' : 'no';
  const reason = gate.status === 'blocked' ? `${gate.reason} ` : '';
  const face = formatCameraLargestFace(frame);
  return `${decision} ${reason}${face}`.trim();
}

function formatCameraLargestFace(frame?: CameraFrameInput): string {
  const face = frame?.foregroundFaceGate?.largestFace;
  if (!face) return 'none';
  return `height ${formatCameraRatio(face.heightRatio)}, area ${formatCameraRatio(face.areaRatio)}`;
}

function logCameraAwarenessCaptureError(error: Error, snapshot?: CameraAwarenessSnapshot): void {
  console.log(
    '[CameraAwareness]',
    'capture failed',
    '| state:', snapshot?.status ?? 'unknown',
    '| error:', error.message || String(error)
  );
}

function formatCameraPerson(presence?: string): string {
  if (presence === 'present') return 'yes';
  if (presence === 'absent') return 'no';
  if (presence === 'uncertain') return 'uncertain';
  return 'unknown';
}

function formatCameraConfidence(confidence?: number): string {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return 'n/a';
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatCameraRatio(ratio?: number): string {
  const value = Number(ratio);
  if (!Number.isFinite(value)) return 'n/a';
  const percent = Math.max(0, value) * 100;
  const precision = percent < 1 ? 2 : 1;
  return `${Number(percent.toFixed(precision))}%`;
}

setupIPC();
app.whenReady().then(createWindow);

// 关闭时总结记忆
app.on('before-quit', async () => {
  cameraAwarenessBackgroundRunner?.stop();
  await chatManager?.summarizeOnShutdown();
});

app.on('window-all-closed', () => {
  cameraAwarenessBackgroundRunner?.stop();
  transitionEngine?.stop();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
