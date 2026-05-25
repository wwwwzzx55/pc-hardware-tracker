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

    const python = process.platform === 'win32' ? 'python' : 'python3';

    const proc = spawn(python, [this.crawlerPath, keyword, category]);
    let stdout = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stdout += data.toString(); });

    proc.on('error', (err) => {
      task.result = { success: false, error: err.message };
      task.status = 'failed';
    });

    proc.on('close', (code) => {
      try {
        task.result = JSON.parse(stdout.trim());
        task.status = task.result.success ? 'completed' : 'failed';
      } catch {
        task.result = { success: false, error: stdout };
        task.status = 'failed';
      }
    });

    return { taskId };
  }

  getTaskStatus(taskId: string): CrawlTask | null {
    return this.tasks.get(taskId) || null;
  }
}
