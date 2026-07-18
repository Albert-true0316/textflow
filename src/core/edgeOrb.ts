import {
  LogicalPosition,
  LogicalSize,
  PhysicalSize,
  type PhysicalPosition,
} from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";

/** 球体逻辑边长（偶数，便于高分屏对齐） */
export const ORB_SIZE = 60;
/** 贴左边/右边进入球体的阈值（逻辑像素）；Win 更紧，减轻与系统分屏抢边 */
export const EDGE_THRESHOLD = 32;
export const EDGE_THRESHOLD_WINDOWS = 10;

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

function isWindowsUa(): boolean {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

/** 排除误存的球体尺寸 */
export function isExpandedGeometry(geo: WindowGeometry): boolean {
  return geo.width > ORB_SIZE + 20 && geo.height > ORB_SIZE + 20;
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

  const thresholdLogical = isWindowsUa()
    ? (opts?.thresholdLogical ?? EDGE_THRESHOLD_WINDOWS)
    : (opts?.thresholdLogical ?? EDGE_THRESHOLD);
  const threshold = thresholdLogical * scale;
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

/** 缩成贴边球体并贴到左/右（与 1.0.0 一致；Win 额外锁 maxSize） */
export async function applyOrbWindow(side: OrbSide): Promise<void> {
  const win = getCurrentWindow();
  const scale = await win.scaleFactor();
  const pos = await win.outerPosition();
  const monitor = await currentMonitor();
  if (!monitor) return;

  const physical = Math.round(ORB_SIZE * scale);
  await win.setMinSize(new LogicalSize(ORB_SIZE, ORB_SIZE));

  if (isWindowsUa()) {
    await win.setMaxSize(new LogicalSize(ORB_SIZE, ORB_SIZE));
  }

  await win.setSize(new PhysicalSize(physical, physical));

  const monX = physicalToLogical(monitor.position.x, scale);
  const monY = physicalToLogical(monitor.position.y, scale);
  const monW = physicalToLogical(monitor.size.width, scale);
  const monH = physicalToLogical(monitor.size.height, scale);
  const curY = physicalToLogical(pos.y, scale);

  const x = side === "left" ? monX + 6 : monX + monW - ORB_SIZE - 6;
  const y = Math.min(Math.max(curY, monY + 8), monY + monH - ORB_SIZE - 8);

  await win.setPosition(new LogicalPosition(x, y));

  if (isWindowsUa()) {
    await win.setSize(new PhysicalSize(physical, physical));
  }

  await nudgeWebviewRepaint();
}

export async function restoreWindowGeometry(geo: WindowGeometry): Promise<void> {
  const win = getCurrentWindow();
  await win.setMaxSize(null);
  await win.setMinSize(new LogicalSize(280, 120));
  await win.setSize(new LogicalSize(geo.width, geo.height));
  await win.setPosition(new LogicalPosition(geo.x, geo.y));
  await nudgeWebviewRepaint();
}

/**
 * 从贴边球体展开：停在球体内侧，不挡当前贴边处桌面内容。
 * 展开用 LogicalSize（1.0.0 已验证）；缩球才用 PhysicalSize。
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
  let x = side === "left" ? orbX + ORB_SIZE + gap : orbX - width - gap;
  x = Math.min(Math.max(x, monX + 8), monX + monW - width - 8);

  let y = orbY + ORB_SIZE / 2 - height / 2;
  y = Math.min(Math.max(y, monY + 8), monY + monH - height - 8);

  if (isWindowsUa()) {
    await win.setMaxSize(null);
  }
  await win.setMinSize(new LogicalSize(280, 120));
  await win.setSize(new LogicalSize(width, height));
  await win.setPosition(new LogicalPosition(x, y));
  await nudgeWebviewRepaint();
}

/**
 * WebView2 在 Windows 上改尺寸后偶发不重绘（白屏）。
 */
export async function nudgeWebviewRepaint(): Promise<void> {
  if (!isWindowsUa()) return;
  try {
    const win = getCurrentWindow();
    const size = await win.outerSize();
    const scale = await win.scaleFactor();
    const logicalW = size.width / scale;
    const logicalH = size.height / scale;
    if (logicalW <= ORB_SIZE + 2 && logicalH <= ORB_SIZE + 2) return;

    const w = Math.max(1, size.width);
    const h = Math.max(1, size.height);
    await win.setSize(new PhysicalSize(w, h === 1 ? 2 : h - 1));
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    await win.setSize(new PhysicalSize(w, h));
  } catch {
    /* ignore */
  }
}
