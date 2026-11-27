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
 * @returns {Promise<{groups: Array<{hash: string, size: number, files: string[], copies: Array<{files: string[], externalLinks: number}>, reclaimableBytes: number}>, scanned: number, hashed: number, wastedBytes: number}>}
 */
async function findDuplicates(rootDir, options = {}) {
  const minSize = Math.max(1, Number(options.minSize) || 1);
  const onWarn = options.onWarn || (() => {});
  const onProgress = options.onProgress || (() => {});

  const files = await walk(rootDir, { ignoreDirs: options.ignoreDirs, onWarn });
  onProgress(`发现 ${files.length} 个文件`);

  // 第一段：按大小分桶
  const bySize = new Map(); // size -> file[]
  const byIdentity = new Map();
  for (const file of files) {
    let stat;
    try {
      stat = await fsp.stat(file, { bigint: true });
    } catch (err) {
      onWarn(`无法读取 ${file}: ${err.code || err.message}`);
      continue;
    }
    const size = Number(stat.size);
    if (size < minSize) continue;
    // BigInt 避免较大的 inode 编号因浮点舍入而发生碰撞。
    const identity = `${stat.dev}:${stat.ino}`;
    const existing = byIdentity.get(identity);
    if (existing) {
      existing.files.push(file);
      continue;
    }
    const item = { file, size, files: [file], links: stat.nlink };
    byIdentity.set(identity, item);
    const bucket = bySize.get(size);
    if (bucket) bucket.push(item);
    else bySize.set(size, [item]);
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
      if (group) group.push(item);
      else byHash.set(key, [item]);
    }
  }

  const groups = [...byHash.entries()]
    .filter(([, fs]) => fs.length > 1)
    .map(([key, items]) => {
      const size = Number(key.slice(0, key.indexOf(":")));
      const copies = items.map(item => ({
        files: item.files.sort(),
        externalLinks: Math.max(0, Number(item.links) - item.files.length),
      }));
      const removable = copies.filter(copy => copy.externalLinks === 0).length;
      // 若范围外没有保留副本，必须保留一份范围内的独立内容。
      const keep = removable === copies.length ? 1 : 0;
      return {
        hash: key.slice(key.indexOf(":") + 1), size,
        files: copies.flatMap(copy => copy.files).sort(), copies,
        reclaimableBytes: size * Math.max(0, removable - keep),
      };
    })
    .sort((a, b) => b.reclaimableBytes - a.reclaimableBytes);

  const wastedBytes = groups.reduce((sum, g) => sum + g.reclaimableBytes, 0);
  return { groups, scanned: files.length, hashed, wastedBytes };
}

module.exports = { findDuplicates };
