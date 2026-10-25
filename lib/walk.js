/** 递归遍历目录，返回所有普通文件的绝对路径。零依赖，Node 18+。 */

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const DEFAULT_IGNORE = new Set([".git", "node_modules", ".DS_Store", "Thumbs.db"]);

/**
 * @param {string} rootDir 起始目录
 * @param {{ignoreDirs?: string[], onWarn?: (msg: string) => void}} [options]
 * @returns {Promise<string[]>}
 */
async function walk(rootDir, options = {}) {
  const ignore = new Set([...DEFAULT_IGNORE, ...(options.ignoreDirs || [])]);
  const onWarn = options.onWarn || (() => {});
  const out = [];
  const queue = [rootDir];

  while (queue.length) {
    const dir = queue.shift();
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch (err) {
      onWarn(`无法读取目录 ${dir}: ${err.code || err.message}`);
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignore.has(entry.name)) queue.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
      // 符号链接一律跳过，避免成环
    }
  }
  return out.sort();
}

module.exports = { walk, DEFAULT_IGNORE };
