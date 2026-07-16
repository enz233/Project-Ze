import {
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
  chatResponder: WorkflowChatResponder;
}

export class ResponseWorkflowOrchestrator {
  private readonly screenAnalyzer: ScreenSummaryTool;
  private readonly screenTargetPointer: ScreenTargetPointerTool;
  private readonly chatResponder: WorkflowChatResponder;

  constructor(options: ResponseWorkflowOrchestratorOptions) {
    this.screenAnalyzer = options.screenAnalyzer;
    this.screenTargetPointer = options.screenTargetPointer;
    this.chatResponder = options.chatResponder;
  }

  async run(request: ResponseWorkflowRequest): Promise<WorkflowExecutionResult> {
    try {
      const context = request.workflow === 'screen_summary_response'
        ? await this.buildScreenSummaryContext(request)
        : await this.buildScreenTargetPointerContext(request);

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
        fallbackMessage: '屏幕工作流执行失败了，你可以稍后再试一次。',
      };
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
    const action: WorkflowActionResult = {
      action: 'none',
      status: 'completed',
      messageForModel: '本地屏幕分析已经完成，请基于 summary 回复用户。',
    };
    return {
      workflow: request.workflow,
      userText: request.userText,
      observations: [observation],
      actionResults: [action],
      privacy: createWorkflowPrivacy(),
    };
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
    const action: WorkflowActionResult = {
      action: 'point_target',
      status,
      messageForModel: this.pointerMessageForModel(pointerResult.moved, status, pointerResult.message),
      debugReason: pointerResult.cancelReason,
    };
    return {
      workflow: request.workflow,
      userText: request.userText,
      observations: [observation],
      actionResults: [action],
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
    if (context.workflow === 'screen_summary_response') {
      return '屏幕结果已生成，但我刚才组织语言失败了。你可以再问我一次这个页面。';
    }
    return '我已经处理了屏幕指向请求，但刚才组织语言失败了。你可以再让我指一次。';
  }

  private summarizeContext(context: WorkflowResponseContext): string {
    const action = context.actionResults[0];
    const observation = context.observations[0];
    return `${context.workflow}:${observation.kind}:${action.status}`;
  }
}
