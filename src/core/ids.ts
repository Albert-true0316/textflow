const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function collectIds(source: string): Set<string> {
  const ids = new Set<string>();
  for (const match of source.matchAll(/\^([a-z0-9]{4,6})\b/g)) {
    ids.add(match[1]);
  }
  return ids;
}

/** 生成文件内唯一的 4–6 位 [a-z0-9] ID（默认 4 位） */
export function generateId(existing: Set<string>, length = 4): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    let id = "";
    for (let i = 0; i < length; i++) {
      id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    if (!existing.has(id)) {
      existing.add(id);
      return id;
    }
  }
  // 极端碰撞时加长
  return generateId(existing, Math.min(6, length + 1));
}
