import { LogicalPosition, LogicalSize, PhysicalSize, type PhysicalPosition } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";

/** 球体逻辑边长（偶数，便于高分屏对齐） */
export const ORB_SIZE = 60;
/** 贴左边/右边进入球体的阈值（逻辑像素） */
export const EDGE_THRESHOLD = 32;

export type OrbSide = "left" | "right";

export type WindowGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function physicalToLogical(n: number, scale: number): number {
  return n / scale;
}

/**
 * 判断窗口是否贴住当前显示器左/右边缘。
 * 返回贴边一侧；不够近则 null。
 */
export async function detectEdgeSide(
  position: PhysicalPosition,
  opts?: { thresholdLogical?: number },
): Promise<OrbSide | null> {
  const win = getCurrentWindow();
  const scale = await win.scaleFactor();
  const size = await win.outerSize();
  const monitor = await currentMonitor();
  if (!monitor) return null;

  const threshold = (opts?.thresholdLogical ?? EDGE_THRESHOLD) * scale;
  const leftGap = position.x - monitor.position.x;
  const rightGap =
    monitor.position.x + monitor.size.width - (position.x + size.width);

  if (leftGap <= threshold) return "left";
  if (rightGap <= threshold) return "right";
  return null;
}

export async function captureWindowGeometry(): Promise<WindowGeometry> {
  const win = getCurrentWindow();
  const scale = await win.scaleFactor();
  const pos = await win.outerPosition();
  const size = await win.outerSize();
  return {
    x: physicalToLogical(pos.x, scale),
    y: physicalToLogical(pos.y, scale),
    width: physicalToLogical(size.width, scale),
    height: physicalToLogical(size.height, scale),
  };
}

/** 缩成贴边球体并贴到左/右（物理像素强制正方形，避免椭圆） */
export async function applyOrbWindow(side: OrbSide): Promise<void> {
  const win = getCurrentWindow();
  const scale = await win.scaleFactor();
  const pos = await win.outerPosition();
  const monitor = await currentMonitor();
  if (!monitor) return;

  const physical = Math.round(ORB_SIZE * scale);
  await win.setMinSize(new LogicalSize(ORB_SIZE, ORB_SIZE));
  await win.setSize(new PhysicalSize(physical, physical));

  const monX = physicalToLogical(monitor.position.x, scale);
  const monY = physicalToLogical(monitor.position.y, scale);
  const monW = physicalToLogical(monitor.size.width, scale);
  const monH = physicalToLogical(monitor.size.height, scale);
  const curY = physicalToLogical(pos.y, scale);

  const x = side === "left" ? monX + 6 : monX + monW - ORB_SIZE - 6;
  const y = Math.min(Math.max(curY, monY + 8), monY + monH - ORB_SIZE - 8);

  await win.setPosition(new LogicalPosition(x, y));
  await nudgeWebviewRepaint();
}

export async function restoreWindowGeometry(geo: WindowGeometry): Promise<void> {
  const win = getCurrentWindow();
  await win.setMinSize(new LogicalSize(280, 120));
  await win.setSize(new LogicalSize(geo.width, geo.height));
  await win.setPosition(new LogicalPosition(geo.x, geo.y));
  await nudgeWebviewRepaint();
}

/**
 * 从贴边球体展开：停在球体内侧，不挡当前贴边处桌面内容。
 * 保留展开后的宽高，竖直方向以球体为中心并钳入屏幕。
 */
export async function expandBesideOrb(
  size: { width: number; height: number },
  side: OrbSide,
): Promise<void> {
  const win = getCurrentWindow();
  const scale = await win.scaleFactor();
  const pos = await win.outerPosition();
  const monitor = await currentMonitor();
  if (!monitor) return;

  const width = Math.max(size.width, 280);
  const height = Math.max(size.height, 200);

  const monX = physicalToLogical(monitor.position.x, scale);
  const monY = physicalToLogical(monitor.position.y, scale);
  const monW = physicalToLogical(monitor.size.width, scale);
  const monH = physicalToLogical(monitor.size.height, scale);
  const orbX = physicalToLogical(pos.x, scale);
  const orbY = physicalToLogical(pos.y, scale);

  const gap = 12;
  let x =
    side === "left" ? orbX + ORB_SIZE + gap : orbX - width - gap;
  x = Math.min(Math.max(x, monX + 8), monX + monW - width - 8);

  let y = orbY + ORB_SIZE / 2 - height / 2;
  y = Math.min(Math.max(y, monY + 8), monY + monH - height - 8);

  await win.setMinSize(new LogicalSize(280, 120));
  await win.setSize(new LogicalSize(width, height));
  await win.setPosition(new LogicalPosition(x, y));
  await nudgeWebviewRepaint();
}

/**
 * WebView2 在 Windows 上改尺寸后偶发不重绘（白屏）。
 * 用 1px 回弹逼一次重绘；其它平台直接跳过。
 */
export async function nudgeWebviewRepaint(): Promise<void> {
  if (typeof navigator !== "undefined" && !/Windows/i.test(navigator.userAgent)) {
    return;
  }
  try {
    const win = getCurrentWindow();
    const size = await win.outerSize();
    const w = Math.max(1, size.width);
    const h = Math.max(1, size.height);
    await win.setSize(new PhysicalSize(w, h === 1 ? 2 : h - 1));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await win.setSize(new PhysicalSize(w, h));
  } catch {
    /* ignore */
  }
}
