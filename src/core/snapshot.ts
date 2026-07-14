export interface SnapshotEntry {
  path: string;
  source: string;
  at: number;
  label: string;
}

const MAX = 30;

/** 进程内撤销栈（后悔药）；后续可落盘到 .textflow/snapshots */
export class SnapshotStack {
  private stack: SnapshotEntry[] = [];

  push(entry: Omit<SnapshotEntry, "at">) {
    this.stack.push({ ...entry, at: Date.now() });
    if (this.stack.length > MAX) this.stack.shift();
  }

  pop(): SnapshotEntry | undefined {
    return this.stack.pop();
  }

  get canUndo() {
    return this.stack.length > 0;
  }

  get size() {
    return this.stack.length;
  }

  clear() {
    this.stack = [];
  }
}

export const snapshots = new SnapshotStack();
