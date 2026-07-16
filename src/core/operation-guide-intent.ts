export type OperationGuideControlCommand = 'next' | 'reidentify' | 'exit';

export function getOperationGuideControlCommand(text: string): OperationGuideControlCommand | null {
  const normalized = normalizeGuideText(text);
  if (/^(我)?(完成了|已完成|下一步|继续|好了)$/.test(normalized)) return 'next';
  if (/^(重新识别|再识别一下|没指准|指错了|重试)$/.test(normalized)) return 'reidentify';
  if (/^(退出教程|结束教程|停止指引|退出指引|取消指引)$/.test(normalized)) return 'exit';
  return null;
}

export function extractOperationGuideSoftwareName(text: string): string | null {
  const normalized = normalizeGuideText(text).replace(/^\./, '').trim();
  const slash = normalized.match(/^\/guide\s+(.+)$/i);
  if (slash) return cleanGoal(slash[1]);
  const patterns = [
    /我想(?:下载|安装|设置|配置|注册|登录)\s*([^，。！？?]+?)(?:，?下一步.*)?$/,
    /帮我(?:下载|安装|设置|配置|注册|登录)\s*([^，。！？?]+?)(?:，?下一步.*)?$/,
    /(?:怎么下载|怎么安装|怎么设置|怎么配置|如何下载|如何安装|如何设置|如何配置)\s*([^，。！？?]+?)$/
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return cleanGoal(match[1]);
  }
  return null;
}

function normalizeGuideText(text: string): string {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function cleanGoal(goal: string): string | null {
  const cleaned = goal.replace(/^(一下|一个)/, '').replace(/(吧|呀|呢|吗|么)$/g, '').trim();
  return cleaned.length >= 2 ? cleaned : null;
}
