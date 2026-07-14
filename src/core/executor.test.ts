import { describe, expect, it } from "vitest";
import { applyOps, ensureTaskIds } from "./executor";

const sample = `# 待办

- [ ] 买菜 🗓️2026-07-15 #生活 ^a3f2
- [ ] 准备下周答辩 #工作 ^p1a2
    - [x] 整理实验数据成图表 ^c001
    - [ ] 写演讲稿逐字稿 🗓️2026-07-16 ^c002
- [x] 交周报 #工作 ^b7c1
`;

describe("applyOps", () => {
  it("toggles only the target checkbox line", () => {
    const { source, applied } = applyOps(sample, [{ op: "complete", id: "a3f2" }]);
    expect(applied).toHaveLength(1);
    expect(source).toContain("- [x] 买菜 🗓️2026-07-15 #生活 ^a3f2");
    expect(source).toContain("- [ ] 准备下周答辩 #工作 ^p1a2");
    expect(source.split("\n")[0]).toBe("# 待办");
  });

  it("completing parent cascades to nested children", () => {
    const { source } = applyOps(sample, [{ op: "complete", id: "p1a2" }]);
    expect(source).toMatch(/- \[x\] 准备下周答辩 #工作 \^p1a2/);
    expect(source).toMatch(/^\s+- \[x\] 整理实验数据成图表 \^c001/m);
    expect(source).toMatch(/^\s+- \[x\] 写演讲稿逐字稿/m);
  });

  it("uncompleting parent cascades to nested children", () => {
    const done = applyOps(sample, [{ op: "complete", id: "p1a2" }]).source;
    const { source } = applyOps(done, [{ op: "uncomplete", id: "p1a2" }]);
    expect(source).toMatch(/- \[ \] 准备下周答辩 #工作 \^p1a2/);
    expect(source).toMatch(/^\s+- \[ \] 整理实验数据成图表 \^c001/m);
  });

  it("uncompletes nested task", () => {
    const { source } = applyOps(sample, [{ op: "uncomplete", id: "c001" }]);
    expect(source).toMatch(/^\s+- \[ \] 整理实验数据成图表 \^c001/m);
  });

  it("adds root and child tasks with generated ids", () => {
    const { source } = applyOps(sample, [
      { op: "add", text: "周五交报告", due: "2026-07-17", tags: ["工作"] },
      { op: "add", text: "对稿", parent_id: "p1a2" },
    ]);
    expect(source).toMatch(/- \[ \] 周五交报告 🗓️2026-07-17 #工作 \^[a-z0-9]{4,6}/);
    expect(source).toMatch(/^\s+- \[ \] 对稿 \^[a-z0-9]{4,6}/m);
  });

  it("deletes a parent and its children", () => {
    const { source } = applyOps(sample, [{ op: "delete", id: "p1a2" }]);
    expect(source).not.toContain("^p1a2");
    expect(source).not.toContain("^c001");
    expect(source).not.toContain("^c002");
    expect(source).toContain("^a3f2");
  });

  it("edits text and due", () => {
    const { source } = applyOps(sample, [
      { op: "edit", id: "a3f2", new_text: "买菜和牛奶", new_due: "2026-07-16" },
    ]);
    expect(source).toContain("- [ ] 买菜和牛奶 🗓️2026-07-16 #生活 ^a3f2");
  });

  it("decomposes into nested subtasks", () => {
    const { source } = applyOps(sample, [
      {
        op: "decompose",
        id: "b7c1",
        subtasks: [{ text: "汇总数据" }, { text: "发邮件", due: "2026-07-13" }],
      },
    ]);
    expect(source).toMatch(
      /- \[x\] 交周报 #工作 \^b7c1\n\s+- \[ \] 汇总数据 \^[a-z0-9]{4,6}/,
    );
  });

  it("preserves non-task markdown content", () => {
    const md = `# 待办

用户手写说明，不要动。

- [ ] 买菜 ^a3f2
`;
    const { source } = applyOps(md, [{ op: "complete", id: "a3f2" }]);
    expect(source).toContain("用户手写说明，不要动。");
    expect(source).toContain("- [x] 买菜 ^a3f2");
  });
});

describe("ensureTaskIds", () => {
  it("appends ids to bare task lines", () => {
    const md = "- [ ] 没有 id 的任务\n";
    const next = ensureTaskIds(md);
    expect(next).toMatch(/- \[ \] 没有 id 的任务 \^[a-z0-9]{4,6}\n/);
  });
});
