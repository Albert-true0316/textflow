import { describe, expect, it } from "vitest";
import { formatTaskMeta, parseTaskMeta, stripTemporalPhrases } from "./format";
import { flattenTasks, parseMarkdown, taskProgress } from "./parser";

describe("parseTaskMeta", () => {
  it("parses due, tags and id", () => {
    const meta = parseTaskMeta("买菜 🗓️2026-07-15 #生活 #超市 ^a3f2");
    expect(meta).toEqual({
      text: "买菜",
      due: "2026-07-15",
      time: undefined,
      tags: ["生活", "超市"],
      id: "a3f2",
    });
  });

  it("parses clock time", () => {
    const meta = parseTaskMeta("开会 🗓️2026-07-17 🕘09:00 ^a1b2");
    expect(meta).toEqual({
      text: "开会",
      due: "2026-07-17",
      time: "09:00",
      tags: [],
      id: "a1b2",
    });
  });

  it("round-trips format", () => {
    const raw = formatTaskMeta({
      text: "交周报",
      due: "2026-07-18",
      time: "14:30",
      tags: ["工作"],
      id: "b7c1",
    });
    expect(parseTaskMeta(raw)).toEqual({
      text: "交周报",
      due: "2026-07-18",
      time: "14:30",
      tags: ["工作"],
      id: "b7c1",
    });
  });
});

describe("stripTemporalPhrases", () => {
  it("strips date and clock phrases from title", () => {
    expect(stripTemporalPhrases("明天上午九点开会")).toBe("开会");
    expect(stripTemporalPhrases("周五交报告")).toBe("交报告");
  });
});

describe("parseMarkdown", () => {
  it("parses nested task list", () => {
    const md = `# 待办

- [ ] 准备下周答辩 #工作 ^p1a2
    - [x] 整理实验数据成图表 ^c001
    - [ ] 写演讲稿逐字稿 🗓️2026-07-16 ^c002
- [x] 交周报 #工作 ^b7c1
`;

    const { tasks } = parseMarkdown(md);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].text).toBe("准备下周答辩");
    expect(tasks[0].tags).toEqual(["工作"]);
    expect(tasks[0].id).toBe("p1a2");
    expect(tasks[0].completed).toBe(false);
    expect(tasks[0].children).toHaveLength(2);
    expect(tasks[0].children[0].completed).toBe(true);
    expect(tasks[0].children[1].due).toBe("2026-07-16");
    expect(tasks[1].completed).toBe(true);

    const progress = taskProgress(tasks[0]);
    expect(progress).toEqual({ done: 1, total: 2 });

    expect(flattenTasks(tasks).map((t) => t.id)).toEqual([
      "p1a2",
      "c001",
      "c002",
      "b7c1",
    ]);
  });
});
