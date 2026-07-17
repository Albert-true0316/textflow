/** 结构化操作（LLM / UI 共用；真正写文件只走 Executor） */
export type Op =
  | { op: "complete"; id: string }
  | { op: "uncomplete"; id: string }
  | {
      op: "add";
      text: string;
      due?: string;
      time?: string;
      tags?: string[];
      parent_id?: string;
    }
  | {
      op: "edit";
      id: string;
      new_text?: string;
      new_due?: string | null;
      new_time?: string | null;
      new_tags?: string[];
    }
  | { op: "delete"; id: string }
  | {
      op: "decompose";
      id: string;
      subtasks: Array<{
        text: string;
        due?: string;
        time?: string;
        tags?: string[];
      }>;
    };

export interface ApplyResult {
  source: string;
  applied: Op[];
  skipped: Array<{ op: Op; reason: string }>;
}
