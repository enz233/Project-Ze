import { AIConfigManager } from './ai-config';
import {
  CameraAffect,
  CameraAwarenessDetectOptions,
  CameraAwarenessDetectionResult,
  CameraAwarenessReason,
  CameraFrameInput,
  CameraPresence,
} from './camera-awareness-types';

const PRESENCE_VALUES: CameraPresence[] = ['present', 'absent', 'uncertain'];
const AFFECT_VALUES: CameraAffect[] = ['positive', 'neutral', 'low_energy', 'unclear'];
const REASON_VALUES: CameraAwarenessReason[] = [
  'person_visible',
  'no_person_visible',
  'too_dark',
  'camera_blocked',
  'image_unclear',
  'api_error',
];

interface VisionChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class VisionImageAnalyzer {
  constructor(private configManager: AIConfigManager) {}

  async detectCameraAwareness(
    frame: CameraFrameInput,
    options: CameraAwarenessDetectOptions
  ): Promise<CameraAwarenessDetectionResult> {
    const config = this.configManager.get();
    if (!config.visionApiKey || !config.visionBaseURL || !config.visionModel) {
      return createApiErrorResult();
    }

    try {
      const response = await fetch(`${config.visionBaseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.visionApiKey}`,
        },
        body: JSON.stringify({
          model: config.visionModel,
          messages: [
            {
              role: 'system',
              content: '你是 Project-Ze 的轻量摄像头感知分析器。只输出 JSON，不输出解释。',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: buildCameraAwarenessPrompt(options.lightAffectEnabled) },
                { type: 'image_url', image_url: { url: toDataUri(frame), detail: 'low' } },
              ],
            },
          ],
          max_tokens: 300,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[VisionImageAnalyzer] Vision API 请求失败 (${response.status}): ${errorText}`);
        return createApiErrorResult();
      }

      const data = (await response.json()) as VisionChatCompletionResponse;
      return parseCameraAwarenessResponse(data.choices?.[0]?.message?.content ?? '', Date.now());
    } catch (error: any) {
      console.error('[VisionImageAnalyzer] 摄像头感知分析失败:', error.message);
      return createApiErrorResult();
    }
  }
}

export function toDataUri(frame: CameraFrameInput): string {
  if (frame.imageBase64.startsWith('data:')) {
    return frame.imageBase64;
  }
  return `data:${frame.mimeType};base64,${frame.imageBase64}`;
}

export function buildCameraAwarenessPrompt(lightAffectEnabled: boolean): string {
  const affectInstruction = lightAffectEnabled
    ? '- 如果用户可见，affect 可为 positive / neutral / low_energy / unclear。affect 是非常粗略的陪伴线索，不是情绪诊断。'
    : '- 不要判断状态线索；affect 固定为 unclear。';

  return `你会收到一张低分辨率摄像头单帧。请只做 Project-Ze 桌宠的轻量陪伴判断。

只输出 JSON：
{"presence":"present|absent|uncertain","confidence":0到1,"affect":"positive|neutral|low_energy|unclear","reason":"person_visible|no_person_visible|too_dark|camera_blocked|image_unclear"}

规则：
- presence 只判断画面中是否有真实用户可见。
- 如果看不清、太暗、遮挡、无法判断，返回 uncertain。
${affectInstruction}
- 不识别身份。
- 不判断年龄、性别、种族等敏感属性。
- 不描述外貌和环境。
- 不输出 JSON 以外的内容。`;
}

export function parseCameraAwarenessResponse(
  raw: string,
  checkedAt: number = Date.now()
): CameraAwarenessDetectionResult {
  try {
    const parsed = JSON.parse(extractJsonObject(raw));
    const presence = normalizeEnum<CameraPresence>(parsed.presence, PRESENCE_VALUES, 'uncertain');
    const confidence = normalizeConfidence(parsed.confidence);
    const affect = normalizeEnum<CameraAffect>(parsed.affect, AFFECT_VALUES, 'unclear');
    const reason = normalizeEnum<CameraAwarenessReason>(parsed.reason, REASON_VALUES, 'api_error');

    return { presence, confidence, affect, reason, checkedAt };
  } catch (_error) {
    return {
      presence: 'uncertain',
      confidence: 0,
      affect: 'unclear',
      reason: 'api_error',
      checkedAt,
    };
  }
}

function createApiErrorResult(): CameraAwarenessDetectionResult {
  return {
    presence: 'uncertain',
    confidence: 0,
    affect: 'unclear',
    reason: 'api_error',
    checkedAt: Date.now(),
  };
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return extractJsonObject(fenced[1]);
  }

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return trimmed.slice(first, last + 1);
  }

  throw new Error('No JSON object found');
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}
