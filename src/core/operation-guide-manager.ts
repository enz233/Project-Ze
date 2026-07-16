import { OperationGuideConfig } from './operation-guide-config';
import { OperationGuidePlan, OperationGuideStep } from './operation-guide-types';

export type OperationGuideManagerStatus = 'idle' | 'planning' | 'waiting' | 'pointing' | 'completed' | 'exited' | 'error';

export interface OperationGuideSnapshot {
  active: boolean;
  sessionId: number;
  status: OperationGuideManagerStatus;
  goal: string;
  source: string;
  softwareName: string;
  plan: OperationGuidePlan | null;
  currentIndex: number;
  currentStepIndex: number;
  currentStep: OperationGuideStep | null;
  totalSteps: number;
  completedStepIds: string[];
  lastMessage: string;
  error: string;
}

export interface OperationGuideManagerDeps {
  getConfig: () => OperationGuideConfig;
  plan: (goal: string, config: OperationGuideConfig) => Promise<OperationGuidePlan>;
  point: (request: { target: string; instruction: string; step: OperationGuideStep }) => Promise<{ ok: boolean; message: string }>;
  emitSnapshot?: (snapshot: OperationGuideSnapshot) => void;
}

export interface OperationGuideStartRequest {
  goal: string;
  source: string;
}

export class OperationGuideManager {
  private readonly deps: OperationGuideManagerDeps;
  private sessionId = 0;
  private snapshot: OperationGuideSnapshot = createIdleSnapshot(0);

  constructor(deps: OperationGuideManagerDeps) {
    this.deps = deps;
  }

  async start(request: OperationGuideStartRequest): Promise<OperationGuideSnapshot> {
    this.setSnapshot(createIdleSnapshot(this.sessionId));
    const id = this.sessionId + 1;
    this.sessionId = id;
    const goal = cleanText(request.goal);
    const source = cleanText(request.source);
    const config = this.deps.getConfig();

    this.setSnapshot({
      ...createIdleSnapshot(id),
      active: true,
      status: 'planning',
      goal,
      source,
    });

    try {
      const plan = await this.deps.plan(goal, config);
      if (!this.isCurrentSession(id)) return this.getSnapshot();

      const firstStep = plan.steps[0] ?? null;
      this.setSnapshot({
        ...this.snapshot,
        active: true,
        status: firstStep ? 'pointing' : 'completed',
        softwareName: plan.softwareName,
        plan,
        currentIndex: 0,
        currentStepIndex: 0,
        currentStep: firstStep,
        totalSteps: plan.steps.length,
      });

      if (firstStep) {
        await this.pointCurrentStep(id);
      }
    } catch (error) {
      if (this.isCurrentSession(id)) {
        this.setSnapshot({
          ...this.snapshot,
          active: false,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.getSnapshot();
  }

  async next(): Promise<OperationGuideSnapshot> {
    if (!this.snapshot.active || !this.snapshot.plan || this.snapshot.status === 'completed') {
      return this.getSnapshot();
    }

    const id = this.snapshot.sessionId;
    const completedStepIds = this.snapshot.currentStep
      ? unique([...this.snapshot.completedStepIds, this.snapshot.currentStep.id])
      : this.snapshot.completedStepIds;
    const nextIndex = this.snapshot.currentIndex + 1;

    if (nextIndex >= this.snapshot.plan.steps.length) {
      this.setSnapshot({
        ...this.snapshot,
        status: 'completed',
        active: false,
        currentIndex: nextIndex,
        currentStepIndex: nextIndex,
        currentStep: null,
        completedStepIds,
        lastMessage: 'Operation guide completed.',
      });
      return this.getSnapshot();
    }

    this.setSnapshot({
      ...this.snapshot,
      status: 'pointing',
      currentIndex: nextIndex,
      currentStepIndex: nextIndex,
      currentStep: this.snapshot.plan.steps[nextIndex],
      completedStepIds,
    });

    await this.pointCurrentStep(id);
    return this.getSnapshot();
  }

  async reidentify(): Promise<OperationGuideSnapshot> {
    if (!this.snapshot.active || !this.snapshot.currentStep) {
      return this.getSnapshot();
    }
    await this.pointCurrentStep(this.snapshot.sessionId);
    return this.getSnapshot();
  }

  exit(): void {
    this.sessionId += 1;
    this.setSnapshot(createIdleSnapshot(this.sessionId));
  }

  getSnapshot(): OperationGuideSnapshot {
    return cloneSnapshot(this.snapshot);
  }

  isActive(): boolean {
    return this.snapshot.active;
  }

  private async pointCurrentStep(sessionId: number): Promise<void> {
    const step = this.snapshot.currentStep;
    if (!step) return;

    const result = await this.deps.point({
      target: step.target,
      instruction: step.instruction,
      step,
    });

    if (!this.isCurrentSession(sessionId)) return;

    this.setSnapshot({
      ...this.snapshot,
      status: result.ok ? 'waiting' : 'error',
      active: result.ok,
      lastMessage: result.message,
      error: result.ok ? '' : result.message,
    });
  }

  private isCurrentSession(sessionId: number): boolean {
    return this.snapshot.sessionId === sessionId && this.sessionId === sessionId;
  }

  private setSnapshot(snapshot: OperationGuideSnapshot): void {
    this.snapshot = cloneSnapshot(snapshot);
    this.deps.emitSnapshot?.(this.getSnapshot());
  }
}

function createIdleSnapshot(sessionId: number, status: OperationGuideManagerStatus = 'idle'): OperationGuideSnapshot {
  return {
    active: false,
    sessionId,
    status,
    goal: '',
    source: '',
    softwareName: '',
    plan: null,
    currentIndex: 0,
    currentStepIndex: 0,
    currentStep: null,
    totalSteps: 0,
    completedStepIds: [],
    lastMessage: '',
    error: '',
  };
}

function cloneSnapshot(snapshot: OperationGuideSnapshot): OperationGuideSnapshot {
  return {
    ...snapshot,
    plan: snapshot.plan ? { ...snapshot.plan, steps: snapshot.plan.steps.map(step => ({ ...step })) } : null,
    currentStep: snapshot.currentStep ? { ...snapshot.currentStep } : null,
    completedStepIds: [...snapshot.completedStepIds],
  };
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
