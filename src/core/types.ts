export interface Task {
  /** 稳定 ID（行尾 ^xxxx）；缺失时为空，仅 UI 用 key */
  id: string;
  text: string;
  completed: boolean;
  due?: string;
  tags: string[];
  children: Task[];
}

export interface ParseResult {
  tasks: Task[];
  /** 原始 Markdown，后续 Executor 回写时对照 */
  source: string;
}

export interface TaskProgress {
  done: number;
  total: number;
}
