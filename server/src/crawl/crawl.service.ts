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

  async startCrawl(keyword: string, category: string): Promise<{ taskId: string }> {
    const taskId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    const task: CrawlTask = { taskId, status: 'running', result: null };
    this.tasks.set(taskId, task);

    const python = process.platform === 'win32'
      ? 'C:/Users/21138/AppData/Local/Programs/Python/Python314/python.exe'
      : 'python3';

    const proc = spawn(python, [this.crawlerPath, keyword, category], {
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
      if (task.status === 'failed') return; // error 事件已处理，不覆盖
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
}
