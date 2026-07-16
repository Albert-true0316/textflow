import { describe, expect, it } from "vitest";
import type { Task } from "./types";
import {
  buildScheduleSections,
  buildTagChips,
  buildTagSections,
  buildWeekDayChips,
  buildWeekScheduleSections,
  filterSectionsByStatus,
  isOverdue,
  overdueDays,
  rebuildTreesInBucket,
  startOfWeekMonday,
  toISODate,
} from "./schedule";

const today = new Date(2026, 6, 15);

describe("buildScheduleSections", () => {
  it("按今天/明天/过期/未设日期分组", () => {
    const base: Task[] = [
      {
        id: "a1",
        text: "今天的事",
        completed: false,
        due: "2026-07-15",
        tags: [],
        children: [],
      },
      {
        id: "a2",
        text: "明天的事",
        completed: false,
        due: "2026-07-16",
        tags: [],
        children: [],
      },
      {
        id: "a3",
        text: "没日期",
        completed: false,
        tags: [],
        children: [],
      },
      {
        id: "a4",
        text: "过期",
        completed: false,
        due: "2026-07-10",
        tags: [],
        children: [],
      },
    ];
    const sections = buildScheduleSections(base, today);
    expect(sections.map((s) => s.id)).toEqual([
      "overdue",
      "today",
      "tomorrow",
      "no-due",
    ]);
    expect(sections[0].tasks[0].text).toBe("过期");
    expect(sections[1].tasks[0].text).toBe("今天的事");
    expect(sections[2].tasks[0].text).toBe("明天的事");
    expect(sections[3].tasks[0].text).toBe("没日期");
  });

  it("未设日期保持父在前、子嵌套在后", () => {
    const tasks: Task[] = [
      {
        id: "p1",
        text: "准备答辩",
        completed: false,
        tags: [],
        children: [
          {
            id: "c1",
            text: "写稿",
            completed: false,
            tags: [],
            children: [
              {
                id: "g1",
                text: "列提纲",
                completed: false,
                tags: [],
                children: [],
              },
            ],
          },
          {
            id: "c2",
            text: "做PPT",
            completed: false,
            tags: [],
            children: [],
          },
        ],
      },
      {
        id: "p2",
        text: "买菜",
        completed: false,
        tags: [],
        children: [],
      },
    ];
    const noDue = buildScheduleSections(tasks, today).find((s) => s.id === "no-due");
    expect(noDue?.tasks.map((t) => t.id)).toEqual(["p1", "p2"]);
    expect(noDue?.tasks[0].children.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(noDue?.tasks[0].children[0].children.map((c) => c.id)).toEqual(["g1"]);
  });

  it("同组外的子任务带祖先路径", () => {
    const tasks: Task[] = [
      {
        id: "p1",
        text: "准备答辩",
        completed: false,
        tags: [],
        children: [
          {
            id: "c1",
            text: "写稿",
            completed: false,
            due: "2026-07-15",
            tags: [],
            children: [],
          },
        ],
      },
    ];
    const todaySec = buildScheduleSections(tasks, today).find((s) => s.id === "today");
    expect(todaySec?.tasks).toHaveLength(1);
    expect(todaySec?.tasks[0].id).toBe("c1");
    expect(todaySec?.tasks[0].parentPath).toBe("准备答辩");
  });

  it("toISODate 使用本地日期", () => {
    expect(toISODate(new Date(2026, 6, 15))).toBe("2026-07-15");
  });
});

describe("due helpers", () => {
  it("判断过期与天数", () => {
    expect(isOverdue("2026-07-14", today)).toBe(true);
    expect(isOverdue("2026-07-15", today)).toBe(false);
    expect(overdueDays("2026-07-14", today)).toBe(1);
    expect(overdueDays("2026-07-10", today)).toBe(5);
  });
});

describe("buildWeekScheduleSections", () => {
  it("自然周周一为 7 月 13 日（2026-07-15 为周三）", () => {
    expect(toISODate(startOfWeekMonday(today))).toBe("2026-07-13");
  });

  it("按周一～周日分组，空日占位", () => {
    const tasks: Task[] = [
      {
        id: "w1",
        text: "周三",
        completed: false,
        due: "2026-07-15",
        tags: [],
        children: [],
      },
      {
        id: "w2",
        text: "上周",
        completed: false,
        due: "2026-07-10",
        tags: [],
        children: [],
      },
    ];
    const sections = buildWeekScheduleSections(tasks, today);
    expect(sections[0].id).toBe("overdue");
    expect(sections[0].tasks[0].text).toBe("上周");
    expect(sections).toHaveLength(8);
    expect(sections[1].id).toBe("week-2026-07-13");
    expect(sections[1].empty).toBe(true);
    const wed = sections.find((s) => s.id === "week-2026-07-15");
    expect(wed?.isToday).toBe(true);
    expect(wed?.tasks[0].text).toBe("周三");
    expect(sections[7].id).toBe("week-2026-07-19");
  });
});

describe("buildWeekDayChips", () => {
  it("返回周一到周日，并统计任务数", () => {
    const tasks: Task[] = [
      {
        id: "w1",
        text: "周三",
        completed: false,
        due: "2026-07-15",
        tags: [],
        children: [],
      },
      {
        id: "w2",
        text: "也是周三",
        completed: false,
        due: "2026-07-15",
        tags: [],
        children: [],
      },
    ];
    const chips = buildWeekDayChips(tasks, today);
    expect(chips).toHaveLength(7);
    expect(chips[0].iso).toBe("2026-07-13");
    expect(chips[0].weekday).toBe("一");
    expect(chips[2].iso).toBe("2026-07-15");
    expect(chips[2].isToday).toBe(true);
    expect(chips[2].count).toBe(2);
    expect(chips[1].count).toBe(0);
  });
});

describe("buildTagSections", () => {
  it("按标签分组，多标签任务会出现在多个分区", () => {
    const tasks: Task[] = [
      {
        id: "t1",
        text: "买菜",
        completed: false,
        tags: ["生活"],
        children: [],
      },
      {
        id: "t2",
        text: "交周报",
        completed: false,
        tags: ["工作"],
        children: [],
      },
      {
        id: "t3",
        text: "超市+发票",
        completed: false,
        tags: ["生活", "工作"],
        children: [],
      },
      {
        id: "t4",
        text: "随便想想",
        completed: false,
        tags: [],
        children: [],
      },
    ];
    const sections = buildTagSections(tasks);
    // 同频时按中文序：工作 < 生活
    expect(sections.map((s) => s.id)).toEqual(["tag-工作", "tag-生活", "no-tag"]);
    expect(sections[0].title).toBe("#工作");
    expect(sections[0].tasks.map((t) => t.id).sort()).toEqual(["t2", "t3"]);
    expect(sections[1].tasks.map((t) => t.id).sort()).toEqual(["t1", "t3"]);
    expect(sections[2].tasks[0].id).toBe("t4");
  });

  it("同标签内保持父子嵌套", () => {
    const tasks: Task[] = [
      {
        id: "p1",
        text: "生活规划",
        completed: false,
        tags: ["生活"],
        children: [
          {
            id: "c1",
            text: "买菜",
            completed: false,
            tags: ["生活"],
            children: [],
          },
        ],
      },
    ];
    const sections = buildTagSections(tasks);
    expect(sections).toHaveLength(1);
    expect(sections[0].tasks[0].id).toBe("p1");
    expect(sections[0].tasks[0].children[0].id).toBe("c1");
  });
});

describe("buildTagChips", () => {
  it("按出现次数排序", () => {
    const tasks: Task[] = [
      {
        id: "a",
        text: "a",
        completed: false,
        tags: ["工作"],
        children: [],
      },
      {
        id: "b",
        text: "b",
        completed: false,
        tags: ["生活"],
        children: [],
      },
      {
        id: "c",
        text: "c",
        completed: false,
        tags: ["生活"],
        children: [],
      },
    ];
    const chips = buildTagChips(tasks);
    expect(chips.map((c) => c.tag)).toEqual(["生活", "工作"]);
    expect(chips[0].count).toBe(2);
    expect(chips[1].count).toBe(1);
  });
});

describe("filterSectionsByStatus", () => {
  it("可筛出已完成 / 已过期 / 未完成", () => {
    const tasks: Task[] = [
      {
        id: "done",
        text: "已做",
        completed: true,
        due: "2026-07-10",
        tags: ["生活"],
        children: [],
      },
      {
        id: "late",
        text: "过期",
        completed: false,
        due: "2026-07-10",
        tags: ["工作"],
        children: [],
      },
      {
        id: "open",
        text: "进行中",
        completed: false,
        due: "2026-07-20",
        tags: ["工作"],
        children: [],
      },
    ];
    const sections = buildTagSections(tasks);
    const done = filterSectionsByStatus(sections, "done", today);
    expect(done).toHaveLength(1);
    expect(done[0].tasks[0].id).toBe("done");

    const overdue = filterSectionsByStatus(sections, "overdue", today);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].tasks[0].id).toBe("late");

    const open = filterSectionsByStatus(sections, "open", today);
    expect(open).toHaveLength(1);
    expect(open[0].id).toBe("tag-工作");
    expect(open[0].tasks.map((t) => t.id)).toEqual(["open"]);
  });
});

describe("rebuildTreesInBucket", () => {
  it("按文档顺序挂回父子", () => {
    const trees = rebuildTreesInBucket([
      {
        id: "p",
        text: "父",
        completed: false,
        tags: [],
        depth: 0,
        order: 0,
      },
      {
        id: "c",
        text: "子",
        completed: false,
        tags: [],
        depth: 1,
        parentId: "p",
        order: 1,
      },
    ]);
    expect(trees).toHaveLength(1);
    expect(trees[0].children[0].id).toBe("c");
  });
});
