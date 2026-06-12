import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { join } from 'path';

export interface CrawlTask {
  taskId: string;
  status: 'running' | 'completed' | 'failed';
  result: any;
}

@Injectable()
export class CrawlService {
  private tasks = new Map<string, CrawlTask>();
  private crawlerPath = join(__dirname, '..', '..', '..', 'crawler', 'main.py');
  private savePath = join(__dirname, '..', '..', '..', 'crawler', 'save.py');

  async startCrawl(keyword: string, category: string, count: number = 10): Promise<{ taskId: string }> {
    const taskId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    const task: CrawlTask = { taskId, status: 'running', result: null };
    this.tasks.set(taskId, task);

    const python = process.env.PYTHON_PATH
      || (process.platform === 'win32' ? 'py' : 'python3');

    // 默认使用 --preview 模式，只爬取不写入数据库
    const proc = spawn(python, [this.crawlerPath, keyword, category, String(count), '--preview'], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('error', (err) => {
      if (!task.result) {
        task.result = { success: false, error: `spawn失败: ${err.message}` };
        task.status = 'failed';
      }
    });

    proc.on('close', (code) => {
      if (task.status === 'failed') return;
      try {
        task.result = JSON.parse(stdout.trim());
        task.status = task.result.success ? 'completed' : 'failed';
      } catch {
        task.result = { success: false, error: stderr || stdout || '爬虫返回异常' };
        task.status = 'failed';
      }
    });

    return { taskId };
  }

  getTaskStatus(taskId: string): CrawlTask | null {
    return this.tasks.get(taskId) || null;
  }

  async confirmSave(category: string, products: Array<{ name: string; price: number; url?: string; img_url?: string }>): Promise<any> {
    return new Promise((resolve, reject) => {
      const python = process.env.PYTHON_PATH
        || (process.platform === 'win32' ? 'py' : 'python3');

      const proc = spawn(python, [this.savePath, category], {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      // 写入 JSON 到 stdin
      const input = JSON.stringify(products);
      proc.stdin.write(input);
      proc.stdin.end();

      proc.on('close', (code) => {
        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch {
          resolve({ success: false, error: stderr || stdout || '写入异常' });
        }
      });

      proc.on('error', (err) => {
        resolve({ success: false, error: `spawn失败: ${err.message}` });
      });
    });
  }
}
