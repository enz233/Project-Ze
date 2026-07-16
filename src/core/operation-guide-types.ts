export type OperationGuideAction = 'click' | 'type' | 'wait' | 'observe';

export interface OperationGuideStep {
  id: string;
  action: OperationGuideAction;
  target: string;
  instruction: string;
  expectedChange?: string;
}

export interface OperationGuidePlan {
  softwareName: string;
  sourceSummary: string;
  steps: OperationGuideStep[];
}

export interface OperationGuideSnapshot {
  softwareName: string;
  plan: OperationGuidePlan;
  currentStepIndex: number;
  currentStep: OperationGuideStep | null;
  completedStepIds: string[];
  status: 'idle' | 'guiding' | 'completed' | 'exited';
}

export interface OperationGuideProgressEvaluation {
  completed: boolean;
  confidence: number;
  currentStage: string;
  nextTargetVisible: boolean;
  reason: string;
}
