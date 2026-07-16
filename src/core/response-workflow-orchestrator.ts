import {
  CameraWorkflowTools,
  ResponseWorkflowRequest,
  ScreenSummaryTool,
  ScreenTargetPointerTool,
  WorkflowActionResult,
  WorkflowChatResponder,
  WorkflowExecutionResult,
  WorkflowObservation,
  WorkflowResponseContext,
  actionStatusFromPointerResult,
  createWorkflowPrivacy,
} from './response-workflow-types';

export interface ResponseWorkflowOrchestratorOptions {
  screenAnalyzer: ScreenSummaryTool;
  screenTargetPointer: ScreenTargetPointerTool;
  cameraTools: CameraWorkflowTools;
  chatResponder: WorkflowChatResponder;
}

export class ResponseWorkflowOrchestrator {
  private readonly screenAnalyzer: ScreenSummaryTool;
  private readonly screenTargetPointer: ScreenTargetPointerTool;
  private readonly cameraTools: CameraWorkflowTools;
  private readonly chatResponder: WorkflowChatResponder;

  constructor(options: ResponseWorkflowOrchestratorOptions) {
    this.screenAnalyzer = options.screenAnalyzer;
    this.screenTargetPointer = options.screenTargetPointer;
    this.cameraTools = options.cameraTools;
    this.chatResponder = options.chatResponder;
  }

  async run(request: ResponseWorkflowRequest): Promise<WorkflowExecutionResult> {
    try {
      const context = await this.buildContext(request);
      try {
        const chatResult = await this.chatResponder.respondFromWorkflow(context);
        return {
          workflow: request.workflow,
          status: 'handled',
          visibleReplyProduced: chatResult.visibleReplyProduced,
          debugSummary: this.summarizeContext(context),
        };
      } catch (error: any) {
        return {
          workflow: request.workflow,
          status: 'fallback',
          visibleReplyProduced: false,
          debugSummary: this.summarizeContext(context),
          error: error?.message || String(error),
          fallbackMessage: this.fallbackMessageForContext(context),
        };
      }
    } catch (error: any) {
      return {
        workflow: request.workflow,
        status: 'failed',
        visibleReplyProduced: false,
        debugSummary: `${request.workflow} failed before chat response`,
        error: error?.message || String(error),
        fallbackMessage: this.fallbackMessageForWorkflow(request.workflow),
      };
    }
  }

  private async buildContext(request: ResponseWorkflowRequest): Promise<WorkflowResponseContext> {
    switch (request.workflow) {
      case 'screen_summary_response':
        return this.buildScreenSummaryContext(request);
      case 'screen_target_pointer_response':
        return this.buildScreenTargetPointerContext(request);
      case 'camera_check_once_response':
        return this.buildCameraPresenceContext(request);
      case 'camera_visual_query_response':
        return this.buildCameraVisualQueryContext(request);
      default:
        throw new Error(`unsupported response workflow: ${(request as any).workflow}`);
    }
  }

  private async buildScreenSummaryContext(request: ResponseWorkflowRequest): Promise<WorkflowResponseContext> {
    const summary = await this.screenAnalyzer.analyze(request.toolText);
    const observation: WorkflowObservation = {
      kind: 'screen_summary',
      source: request.source,
      userText: request.userText,
      summary,
    };
    return this.context(request, [observation], [{
      action: 'capture_screen',
      status: 'completed',
      messageForModel: '屏幕截图和 Vision 分析已经完成，请基于 screen_summary observation 回复用户。',
    }]);
  }

  private async buildScreenTargetPointerContext(request: ResponseWorkflowRequest): Promise<WorkflowResponseContext> {
    const pointerResult = await this.screenTargetPointer.handle(request.toolText, { suppressResultBubble: true });
    const locate = pointerResult.locateResult;
    const observation: WorkflowObservation = {
      kind: 'screen_target_pointer',
      source: request.source,
      userText: request.userText,
      target: locate?.label || request.toolText,
      found: locate?.found,
      confidence: locate?.confidence,
      reason: locate?.reason || pointerResult.message,
      warnings: pointerResult.cancelReason ? [pointerResult.cancelReason] : undefined,
    };
    const status = actionStatusFromPointerResult(pointerResult);
    return this.context(request, [observation], [{
      action: 'point_target',
      status,
      messageForModel: this.pointerMessageForModel(pointerResult.moved, status, pointerResult.message),
      debugReason: pointerResult.cancelReason,
    }]);
  }

  private async buildCameraPresenceContext(request: ResponseWorkflowRequest): Promise<WorkflowResponseContext> {
    const result = await this.cameraTools.checkPresence();
    const observation: WorkflowObservation = {
      kind: 'camera_presence',
      source: request.source,
      userText: request.userText,
      presence: result.presence,
      confidence: result.confidence,
      affect: result.affect,
      reason: result.reason,
    };
    return this.context(request, [observation], [{
      action: 'capture_camera',
      status: 'completed',
      messageForModel: '摄像头单帧人在/不在检测已经完成，请基于 camera_presence observation 回复用户。',
    }]);
  }

  private async buildCameraVisualQueryContext(request: ResponseWorkflowRequest): Promise<WorkflowResponseContext> {
    const summary = await this.cameraTools.analyzeVisualQuery(request.toolText);
    const observation: WorkflowObservation = {
      kind: 'camera_visual',
      source: request.source,
      userText: request.userText,
      summary,
      warnings: ['single_camera_frame', 'no_identity_or_sensitive_attribute_inference'],
    };
    return this.context(request, [observation], [{
      action: 'capture_camera',
      status: 'completed',
      messageForModel: '摄像头单帧视觉分析已经完成，请基于 camera_visual observation 回复用户。',
    }]);
  }

  private context(
    request: ResponseWorkflowRequest,
    observations: WorkflowObservation[],
    actionResults: WorkflowActionResult[]
  ): WorkflowResponseContext {
    return {
      workflow: request.workflow,
      userText: request.userText,
      observations,
      actionResults,
      privacy: createWorkflowPrivacy(),
    };
  }

  private pointerMessageForModel(moved: boolean, status: string, message: string): string {
    if (moved) return '已经移动到目标附近并切换 point visual 指向目标。';
    if (status === 'cancelled') return '目标指向流程已取消，没有移动。请按取消原因向用户简短解释。';
    if (status === 'skipped') return '没有执行移动。请说明目标未找到、不够明确或不适合指向。';
    return message || '目标指向流程失败，没有移动。';
  }

  private fallbackMessageForContext(context: WorkflowResponseContext): string {
    return this.fallbackMessageForWorkflow(context.workflow);
  }

  private fallbackMessageForWorkflow(workflow: string): string {
    if (workflow === 'screen_summary_response') return '屏幕结果已生成，但我刚才组织语言失败了。';
    if (workflow === 'screen_target_pointer_response') return '我已经处理了屏幕指向请求，但刚才组织语言失败了。';
    if (workflow === 'camera_check_once_response') return '摄像头检测结果已生成，但我刚才组织语言失败了。';
    return '摄像头观察结果已生成，但我刚才组织语言失败了。';
  }

  private summarizeContext(context: WorkflowResponseContext): string {
    const observation = context.observations[0];
    const action = context.actionResults[0];
    return `${context.workflow}:${observation?.kind ?? 'none'}:${action?.status ?? 'none'}`;
  }
}
