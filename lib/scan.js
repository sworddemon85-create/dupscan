/**
 * 扫描重复文件：先按文件大小分桶（大小不同必不重复），
 * 只对同大小的候选做 SHA-256，再按哈希分组。
 * 这是去重工具的经典两段式优化，避免给每个文件都算哈希。
 */

const fsp = require("fs/promises");
const { walk } = require("./walk");
const { sha256File } = require("./hash");

/**
 * @param {string} rootDir 要扫描的目录
 * @param {{minSize?: number, ignoreDirs?: string[], onWarn?: (m: string) => void, onProgress?: (m: string) => void}} [options]
 *   minSize 只统计不小于该字节数的文件（默认 1，即跳过空文件）
 * @returns {Promise<{groups: Array<{hash: string, size: number, files: string[]}>, scanned: number, hashed: number, wastedBytes: number}>}
 */
async function findDuplicates(rootDir, options = {}) {
  const minSize = Math.max(1, Number(options.minSize) || 1);
  const onWarn = options.onWarn || (() => {});
  const onProgress = options.onProgress || (() => {});

  const files = await walk(rootDir, { ignoreDirs: options.ignoreDirs, onWarn });
  onProgress(`发现 ${files.length} 个文件`);

  // 第一段：按大小分桶
  const bySize = new Map(); // size -> file[]
  for (const file of files) {
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch (err) {
      onWarn(`无法读取 ${file}: ${err.code || err.message}`);
      continue;
    }
    if (stat.size < minSize) continue;
    const bucket = bySize.get(stat.size);
    if (bucket) bucket.push({ file, size: stat.size });
    else bySize.set(stat.size, [{ file, size: stat.size }]);
  }

  // 第二段：只对大小相同的候选算哈希
  const byHash = new Map(); // `${size}:${hash}` -> files
  let hashed = 0;
  for (const bucket of bySize.values()) {
    if (bucket.length < 2) continue; // 大小唯一，必不重复
    for (const item of bucket) {
      let digest;
      try {
        digest = await sha256File(item.file);
      } catch (err) {
        onWarn(`无法哈希 ${item.file}: ${err.code || err.message}`);
        continue;
      }
      hashed += 1;
      const key = `${item.size}:${digest}`;
      const group = byHash.get(key);
      if (group) group.push(item.file);
      else byHash.set(key, [item.file]);
    }
  }

  const groups = [...byHash.entries()]
    .filter(([, fs]) => fs.length > 1)
    .map(([key, fs]) => {
      const size = Number(key.slice(0, key.indexOf(":")));
      return { hash: key.slice(key.indexOf(":") + 1), size, files: fs.sort() };
    })
    .sort((a, b) => b.size * b.files.length - a.size * a.files.length);

  const wastedBytes = groups.reduce((sum, g) => sum + g.size * (g.files.length - 1), 0);
  return { groups, scanned: files.length, hashed, wastedBytes };
}

module.exports = { findDuplicates };
