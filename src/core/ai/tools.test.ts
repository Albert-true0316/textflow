import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { validateOps } from "./tools";

const tasks: Task[] = [
  {
    id: "a3f2",
    text: "买菜",
    completed: false,
    tags: ["生活"],
    due: "2026-07-15",
    children: [],
  },
];

describe("validateOps", () => {
  it("accepts valid ops and drops bad ids", () => {
    const { ops, rejected } = validateOps(
      {
        ops: [
          { op: "complete", id: "a3f2" },
          { op: "complete", id: "nope" },
          { op: "add", text: "周五交报告", due: "2026-07-17" },
        ],
      },
      tasks,
    );
    expect(ops).toEqual([
      { op: "complete", id: "a3f2" },
      { op: "add", text: "周五交报告", due: "2026-07-17", tags: undefined, parent_id: undefined },
    ]);
    expect(rejected.some((r) => r.includes("无效 id"))).toBe(true);
  });

  it("strips ^ from ids", () => {
    const { ops, rejected } = validateOps(
      { ops: [{ op: "complete", id: "^a3f2" }] },
      tasks,
    );
    expect(ops).toEqual([{ op: "complete", id: "a3f2" }]);
    expect(rejected).toEqual([]);
  });

  it("forceDecomposeId rewrites bad decompose id", () => {
    const { ops, rejected } = validateOps(
      {
        ops: [
          {
            op: "decompose",
            id: "wrong",
            subtasks: [
              { text: "列出清单" },
              { text: "去超市" },
              { text: "结账回家" },
            ],
          },
        ],
      },
      tasks,
      { forceDecomposeId: "a3f2" },
    );
    expect(ops).toEqual([
      {
        op: "decompose",
        id: "a3f2",
        subtasks: [
          { text: "列出清单", due: undefined, tags: undefined },
          { text: "去超市", due: undefined, tags: undefined },
          { text: "结账回家", due: undefined, tags: undefined },
        ],
      },
    ]);
    expect(rejected).toEqual([]);
  });
});
