import * as os from 'os';
import { exec } from 'child_process';

export interface ActivityContext {
  windowTitle: string;
  processName: string;
  category?: string;
  matchedActivity?: string;
  bubble?: string;
}

interface ActivityRule {
  category: string;
  processName: string;
  keywords: string[];
  bubble?: string;
}

const ACTIVITY_RULES: ActivityRule[] = [
  { category: 'coding', processName: 'VSCode', keywords: ['Visual Studio Code', 'VSCode', 'WebStorm', 'IntelliJ', 'PyCharm', 'Cursor'], bubble: '在写代码吗~' },
  { category: 'video', processName: 'Video', keywords: ['YouTube', 'Bilibili', 'bilibili', '爱奇艺', '腾讯视频', 'Netflix'], bubble: '在看什么呀~' },
  { category: 'chat', processName: 'Chat', keywords: ['微信', 'WeChat', 'QQ', 'Telegram', 'Discord', 'Slack'], bubble: '在聊天吗~' },
  { category: 'game', processName: 'Game', keywords: ['Steam', 'Epic', 'WeGame', '游戏', 'Game'], bubble: '在玩游戏呀~' },
  { category: 'work', processName: 'Work', keywords: ['Word', 'PowerPoint', 'Excel', 'Notion', '飞书', '钉钉', 'WPS'], bubble: '在工作吗~' },
  { category: 'browser', processName: 'Browser', keywords: ['Chrome', 'Firefox', 'Edge', '浏览器', 'Browser', 'Opera'], bubble: '在逛什么呢~' },
];

export class WindowActivityService {
  async getActiveWindowTitle(): Promise<string> {
    const platform = os.platform();
    return new Promise((resolve) => {
      let cmd: string;
      if (platform === 'darwin') {
        cmd = `osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`;
      } else if (platform === 'win32') {
        const script = [
          'Add-Type -TypeDefinition @"',
          'using System;',
          'using System.Runtime.InteropServices;',
          'using System.Text;',
          'public class Win32 {',
          '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
          '  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);',
          '}',
          '"@',
          '$h = [Win32]::GetForegroundWindow()',
          '$sb = New-Object System.Text.StringBuilder 256',
          '[Win32]::GetWindowText($h, $sb, 256) | Out-Null',
          '$sb.ToString()',
        ].join('; ');
        const encoded = Buffer.from(script, 'utf16le').toString('base64');
        cmd = `powershell -NoProfile -EncodedCommand ${encoded}`;
      } else {
        resolve('');
        return;
      }

      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        if (error) {
          resolve('');
          return;
        }
        resolve(stdout.trim());
      });
    });
  }

  extractProcessName(title: string): string {
    if (!title) return '';
    const rule = this.findRule(title);
    if (rule) return rule.processName;
    return title.split(' - ')[0] || title;
  }

  classify(title: string): ActivityContext {
    const rule = this.findRule(title);
    return {
      windowTitle: title,
      processName: rule ? rule.processName : this.extractProcessName(title),
      category: rule?.category,
      matchedActivity: rule?.category,
      bubble: rule?.bubble,
    };
  }

  private findRule(title: string): ActivityRule | undefined {
    const lower = title.toLowerCase();
    return ACTIVITY_RULES.find(rule =>
      rule.keywords.some(keyword => lower.includes(keyword.toLowerCase()))
    );
  }
}
