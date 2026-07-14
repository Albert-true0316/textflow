import { rename, writeTextFile } from "@tauri-apps/plugin-fs";

/** 先写临时文件再原子替换，避免写一半损坏 */
export async function atomicWriteTextFile(path: string, contents: string) {
  const tmp = `${path}.textflow.tmp`;
  await writeTextFile(tmp, contents);
  try {
    await rename(tmp, path);
  } catch {
    // 部分平台 rename 覆盖失败时，直接写目标路径兜底
    await writeTextFile(path, contents);
  }
}
