#!/usr/bin/env node
/*
 * dupscan CLI — 扫描目录中的重复文件
 *
 * 用法：
 *   node cli.js <目录> [--min-size 1MB] [--json] [--top N] [--ignore dirs]
 *
 * 示例：
 *   node cli.js D:\Download
 *   node cli.js . --min-size 10MB --top 5
 *   node cli.js . --json > dup.json
 */

function parseSize(text) {
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(String(text).trim());
  if (!m) throw new Error(`无法解析大小: ${text}（示例: 500 / 10KB / 1.5MB）`);
  const n = Number(m[1]);
  const unit = (m[2] || "b").toLowerCase();
  return Math.max(1, Math.floor(n * { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[unit]));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

async function main() {
  const args = process.argv.slice(2);
  const options = { _: [], minSize: 1, json: false, top: 0, ignore: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--min-size") options.minSize = parseSize(args[++i]);
    else if (args[i] === "--json") options.json = true;
    else if (args[i] === "--top") options.top = Number(args[++i]) || 0;
    else if (args[i] === "--ignore") options.ignore.push(...String(args[++i]).split(","));
    else if (args[i] === "--help" || args[i] === "-h") return printHelp();
    else options._.push(args[i]);
  }
  const root = options._[0];
  if (!root) return printHelp();

  const { findDuplicates } = require("./lib/scan");
  const started = Date.now();
  const result = await findDuplicates(root, {
    minSize: options.minSize,
    ignoreDirs: options.ignore,
    onWarn: (m) => process.stderr.write(`warn: ${m}\n`),
    onProgress: (m) => process.stderr.write(`${m}\n`),
  });

  let groups = result.groups;
  if (options.top > 0) groups = groups.slice(0, options.top);

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        { root, scanned: result.scanned, hashed: result.hashed, wastedBytes: result.wastedBytes, groups },
        null,
        2
      ) + "\n"
    );
    return;
  }

  console.log(`扫描目录: ${root}`);
  console.log(`文件总数: ${result.scanned}（其中 ${result.hashed} 个计算了哈希）`);
  console.log(`重复组数: ${groups.length}${options.top ? `（仅显示前 ${options.top} 组）` : ""}`);
  console.log(`可释放空间: ${formatBytes(result.wastedBytes)}`);
  for (const [i, g] of groups.entries()) {
    console.log(`\n#${i + 1} ${formatBytes(g.size)} × ${g.files.length} = 可释放 ${formatBytes(g.size * (g.files.length - 1))}`);
    for (const f of g.files) console.log(`    ${f}`);
  }
  if (!groups.length) console.log("\n没有发现重复文件 ✅");
  process.stderr.write(`耗时 ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

function printHelp() {
  console.log(`dupscan — 零依赖重复文件扫描器

用法:
  node cli.js <目录> [选项]

选项:
  --min-size <大小>   只统计不小于该大小的文件，如 500 / 10KB / 1.5MB（默认 1B）
  --top <N>           只显示浪费空间最大的前 N 组
  --ignore <目录,...>  额外忽略的目录名（默认已忽略 node_modules/.git 等）
  --json              以 JSON 输出（可重定向保存报告）
  -h, --help          显示帮助`);
}

main().catch((err) => {
  console.error(`错误: ${err.message}`);
  process.exit(1);
});
