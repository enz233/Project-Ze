import { desktopCapturer, screen } from 'electron';
import { AIConfigManager } from './ai-config';
import {
  SCREEN_FINGERPRINT_HEIGHT,
  SCREEN_FINGERPRINT_WIDTH,
  ScreenFingerprint,
  createScreenFingerprintFromBitmap,
} from './screen-fingerprint';

export interface ScreenCaptureFrame {
  imageDataUri: string;
  origin: { x: number; y: number };
  screenSize: { width: number; height: number };
  imageSize: { width: number; height: number };
  fingerprint?: ScreenFingerprint;
}

export interface ScreenTargetLocateResult {
  found: boolean;
  label: string;
  confidence: number;
  point?: { x: number; y: number };
  reason?: string;
}

export interface ScreenTargetLocateResponse {
  result: ScreenTargetLocateResult;
  frame: ScreenCaptureFrame;
}

export class ScreenAnalyzer {
  private configManager: AIConfigManager;

  constructor(configManager: AIConfigManager) {
    this.configManager = configManager;
  }

  /** 截屏并分析 */
  async analyze(userMessage: string): Promise<string> {
    const config = this.configManager.get();

    if (!config.visionApiKey || !config.visionBaseURL || !config.visionModel) {
      return '（屏幕分析未配置，请在设置中配置 Vision API）';
    }

    const frame = await this.captureScreenFrame();
    if (!frame) {
      return '（截屏失败）';
    }

    try {
      const response = await this.callVisionAPI(frame.imageDataUri, userMessage, config);
      return response;
    } catch (error: any) {
      console.error('[ScreenAnalyzer] Vision API 调用失败:', error.message);
      return '（屏幕分析失败: ' + error.message + '）';
    }
  }

  /** 截取屏幕，返回 base64 data URI。保留旧接口给现有调用方。 */
  async captureScreen(): Promise<string | null> {
    const frame = await this.captureScreenFrame();
    return frame?.imageDataUri ?? null;
  }

  /** 截取主屏幕并返回坐标映射所需元信息 */
  async captureScreenFrame(): Promise<ScreenCaptureFrame | null> {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const displays = screen.getAllDisplays();
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1280, height: 720 },
      });

      console.log('[ScreenAnalyzer][debug] capture sources:', {
        primaryDisplayId: primaryDisplay.id,
        primaryBounds: primaryDisplay.bounds,
        displayIds: displays.map(display => ({ id: display.id, bounds: display.bounds, scaleFactor: display.scaleFactor })),
        sourceIds: sources.map(source => ({ id: source.id, displayId: source.display_id, name: source.name })),
      });

      if (sources.length === 0) return null;

      const matchedSource = sources.find((source) => String(source.display_id) === String(primaryDisplay.id))
        ?? (sources.length === 1 ? sources[0] : undefined);
      if (!matchedSource) {
        console.error('[ScreenAnalyzer] 未找到主屏幕截图源，跳过可能错配的坐标映射');
        return null;
      }

      const matchedDisplay = displays.find((display) => String(display.id) === String(matchedSource.display_id)) ?? primaryDisplay;
      const resized = matchedSource.thumbnail.resize({ width: 1280, height: 720 });
      let fingerprint: ScreenFingerprint | undefined;
      try {
        const fingerprintImage = matchedSource.thumbnail.resize({
          width: SCREEN_FINGERPRINT_WIDTH,
          height: SCREEN_FINGERPRINT_HEIGHT,
        });
        const fingerprintSize = fingerprintImage.getSize();
        fingerprint = createScreenFingerprintFromBitmap(
          fingerprintImage.toBitmap(),
          fingerprintSize.width,
          fingerprintSize.height
        ) ?? undefined;
      } catch (error: any) {
        console.warn('[ScreenAnalyzer] 屏幕指纹生成失败，继续返回截图帧:', error.message);
      }
      const imageSize = resized.getSize();
      const base64 = resized.toPNG().toString('base64');
      const frame: ScreenCaptureFrame = {
        imageDataUri: `data:image/png;base64,${base64}`,
        origin: { x: matchedDisplay.bounds.x, y: matchedDisplay.bounds.y },
        screenSize: { width: matchedDisplay.bounds.width, height: matchedDisplay.bounds.height },
        imageSize: { width: imageSize.width, height: imageSize.height },
        fingerprint,
      };

      console.log('[ScreenAnalyzer][debug] capture frame:', {
        sourceDisplayId: matchedSource.display_id,
        sourceName: matchedSource.name,
        origin: frame.origin,
        screenSize: frame.screenSize,
        imageSize: frame.imageSize,
        fingerprint: frame.fingerprint
          ? { width: frame.fingerprint.width, height: frame.fingerprint.height, values: frame.fingerprint.values.length }
          : null,
      });

      return frame;
    } catch (error: any) {
      console.error('[ScreenAnalyzer] 截屏失败:', error.message);
      return null;
    }
  }

  /** 截屏并让 Vision 模型定位用户描述的当前可见目标 */
  async locateTarget(userMessage: string): Promise<ScreenTargetLocateResponse> {
    const config = this.configManager.get();
    if (!config.visionApiKey || !config.visionBaseURL || !config.visionModel) {
      throw new Error('屏幕分析未配置，请在设置中配置 Vision API');
    }

    const frame = await this.captureScreenFrame();
    if (!frame) {
      throw new Error('截屏失败');
    }

    const response = await this.callVisionAPI(
      frame.imageDataUri,
      this.buildLocatePrompt(userMessage, frame),
      {
        ...config,
        visionSystemPrompt: '你是屏幕目标定位助手，只能输出 JSON，不要输出 Markdown。',
      }
    );

    return {
      result: this.parseLocateResult(response, frame),
      frame,
    };
  }

  mapPointToScreen(frame: ScreenCaptureFrame, point: { x: number; y: number }): { x: number; y: number } {
    const scaleX = frame.screenSize.width / frame.imageSize.width;
    const scaleY = frame.screenSize.height / frame.imageSize.height;
    const screenPoint = {
      x: Math.round(frame.origin.x + point.x * scaleX),
      y: Math.round(frame.origin.y + point.y * scaleY),
    };
    console.log('[ScreenAnalyzer][debug] map point to screen:', {
      point,
      origin: frame.origin,
      screenSize: frame.screenSize,
      imageSize: frame.imageSize,
      scaleX,
      scaleY,
      screenPoint,
    });
    return screenPoint;
  }

  private buildLocatePrompt(userMessage: string, frame: ScreenCaptureFrame): string {
    return [
      '用户希望你在当前截图中定位一个可见的屏幕目标。',
      `用户请求：${userMessage}`,
      `截图像素尺寸：${frame.imageSize.width}x${frame.imageSize.height}`,
      '坐标规则：point 必须是截图左上角为 (0,0) 的像素坐标，x 向右增大，y 向下增大。',
      '只定位当前截图中清晰可见的按钮、链接、文字入口或明显 UI 区域。',
      '如果目标不可见、候选过多、或你不确定，请返回 found=false 或 confidence 低于 0.72。',
      '只输出一个 JSON 对象，格式必须是：',
      '{"found":true,"label":"目标名称","confidence":0.82,"point":{"x":100,"y":200},"reason":"为什么认为这里是目标"}',
      '如果找不到，输出：',
      '{"found":false,"label":"目标名称","confidence":0,"reason":"当前截图里没看到目标"}',
      '不要输出解释文字，不要使用 Markdown 代码块。',
    ].join('\n');
  }

  private parseLocateResult(raw: string, frame: ScreenCaptureFrame): ScreenTargetLocateResult {
    const fallback: ScreenTargetLocateResult = {
      found: false,
      label: '',
      confidence: 0,
      reason: 'Vision 未返回可解析的定位结果',
    };

    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return fallback;
      const parsed = JSON.parse(match[0]) as any;
      const confidence = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0;
      const label = typeof parsed.label === 'string' ? parsed.label.trim() : '';
      const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
      const point = this.parsePoint(parsed.point, frame);
      const locateResult = {
        found: parsed.found === true && !!point,
        label,
        confidence,
        point,
        reason,
      };
      console.log('[ScreenAnalyzer][debug] locate result:', locateResult);
      return locateResult;
    } catch (error: any) {
      console.error('[ScreenAnalyzer] 定位 JSON 解析失败:', error.message, raw);
      return fallback;
    }
  }

  private parsePoint(value: any, frame: ScreenCaptureFrame): { x: number; y: number } | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const x = Number(value.x);
    const y = Number(value.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
    if (x < 0 || y < 0 || x > frame.imageSize.width || y > frame.imageSize.height) return undefined;
    return { x: Math.round(x), y: Math.round(y) };
  }

  /** 调用 Vision API（OpenAI 兼容格式） */
  private async callVisionAPI(
    imageDataUri: string,
    userMessage: string,
    config: any
  ): Promise<string> {
    const messages = [
      {
        role: 'system',
        content: config.visionSystemPrompt || '你是一个桌面助手，简短描述用户屏幕上的内容。',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: userMessage || '描述一下屏幕上有什么' },
          {
            type: 'image_url',
            image_url: {
              url: imageDataUri,
              detail: 'low',
            },
          },
        ],
      },
    ];

    const response = await fetch(`${config.visionBaseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.visionApiKey}`,
      },
      body: JSON.stringify({
        model: config.visionModel,
        messages,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API 请求失败 (${response.status}): ${error}`);
    }

    const data = await response.json() as any;
    return data.choices?.[0]?.message?.content ?? '（无响应）';
  }
}
