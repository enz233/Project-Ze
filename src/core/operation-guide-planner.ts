import { OperationGuideAction, OperationGuidePlan, OperationGuideStep } from './operation-guide-types';

const VALID_ACTIONS: ReadonlySet<OperationGuideAction> = new Set(['click', 'type', 'wait', 'observe']);

export function buildFallbackPlan(softwareName: string): OperationGuidePlan {
  const name = cleanText(softwareName) || '目标软件';
  return {
    softwareName: name,
    sourceSummary: 'Fallback operation guide generated from the requested software name.',
    steps: [
      {
        id: 'open-browser',
        action: 'click',
        target: '浏览器或搜索入口',
        instruction: `打开浏览器或系统搜索入口，准备查找 ${name} 的官方下载页面。`,
        expectedChange: '浏览器或搜索界面可用。'
      },
      {
        id: 'search-official-site',
        action: 'type',
        target: '搜索框',
        instruction: `搜索“${name} 官方下载”并优先选择官方网站或可信应用商店结果。`,
        expectedChange: '出现与目标软件相关的官方结果。'
      },
      {
        id: 'open-download-page',
        action: 'click',
        target: '官方结果或下载入口',
        instruction: `进入 ${name} 的官方网站下载页，避免点击广告或不明镜像站。`,
        expectedChange: '打开官方软件下载或安装说明页面。'
      },
      {
        id: 'start-download',
        action: 'click',
        target: '下载按钮',
        instruction: `点击适合当前系统的 ${name} 下载按钮。`,
        expectedChange: '安装包开始下载，或应用商店安装页打开。'
      },
      {
        id: 'run-installer',
        action: 'observe',
        target: '下载完成的安装包',
        instruction: '下载完成后运行安装包，并按照安装向导的安全提示继续。',
        expectedChange: '安装向导启动或安装进度开始。'
      }
    ]
  };
}

export function parseGuidePlan(raw: string, fallbackSoftwareName: string): OperationGuidePlan {
  const parsed = parseJsonEnvelope(raw);
  if (!isRecord(parsed)) return buildFallbackPlan(fallbackSoftwareName);

  const softwareName = cleanText(parsed.softwareName) || cleanText(fallbackSoftwareName) || '目标软件';
  const sourceSummary = cleanText(parsed.sourceSummary) || 'Parsed operation guide plan.';
  const stepsInput = Array.isArray(parsed.steps) ? parsed.steps : [];
  const steps = stepsInput
    .map((step, index) => sanitizeStep(step, index))
    .filter((step): step is OperationGuideStep => step !== null);

  if (steps.length === 0) return buildFallbackPlan(softwareName);

  return {
    softwareName,
    sourceSummary,
    steps
  };
}

function sanitizeStep(value: unknown, index: number): OperationGuideStep | null {
  if (!isRecord(value)) return null;

  const target = cleanText(value.target);
  const instruction = cleanText(value.instruction);
  if (!target || !instruction) return null;

  return {
    id: cleanText(value.id) || `step-${index + 1}`,
    action: sanitizeAction(value.action),
    target,
    instruction,
    ...(cleanText(value.expectedChange) ? { expectedChange: cleanText(value.expectedChange) } : {})
  };
}

function sanitizeAction(value: unknown): OperationGuideAction {
  const action = cleanText(value).toLowerCase() as OperationGuideAction;
  return VALID_ACTIONS.has(action) ? action : 'click';
}

function parseJsonEnvelope(raw: string): unknown {
  const objectText = extractJsonObject(raw);
  if (!objectText) return null;
  try {
    return JSON.parse(objectText);
  } catch {
    return null;
  }
}

function extractJsonObject(raw: string): string | null {
  const text = String(raw || '');
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
