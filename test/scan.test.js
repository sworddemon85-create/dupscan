const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

const { walk } = require("../lib/walk");
const { sha256File, sha256String } = require("../lib/hash");
const { findDuplicates } = require("../lib/scan");

async function makeTree(spec) {
  // spec: { "a/b.txt": "content", ... } —— 相对测试临时目录
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "dupscan-test-"));
  for (const [rel, content] of Object.entries(spec)) {
    const target = path.join(root, rel);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, content);
  }
  return root;
}

test("walk 递归收集所有文件并排序", async () => {
  const root = await makeTree({
    "b.txt": "1",
    "a/c.txt": "2",
    "a/d/e.txt": "3",
  });
  const files = await walk(root);
  assert.deepStrictEqual(
    files.map((f) => path.relative(root, f).split(path.sep).join("/")),
    ["a/c.txt", "a/d/e.txt", "b.txt"]
  );
  await fsp.rm(root, { recursive: true, force: true });
});

test("walk 默认忽略 node_modules 与 .git", async () => {
  const root = await makeTree({
    "keep.txt": "1",
    "node_modules/pkg/index.js": "2",
    ".git/objects/xx": "3",
  });
  const files = await walk(root);
  assert.strictEqual(files.length, 1);
  assert.ok(files[0].endsWith("keep.txt"));
  await fsp.rm(root, { recursive: true, force: true });
});

test("sha256File 与 sha256String 结果一致", async () => {
  const root = await makeTree({ "a.txt": "hello dupscan" });
  const digest = await sha256File(path.join(root, "a.txt"));
  assert.strictEqual(digest, sha256String("hello dupscan"));
  assert.strictEqual(digest.length, 64);
  await fsp.rm(root, { recursive: true, force: true });
});

test("findDuplicates 按内容分组且忽略大小不同的文件", async () => {
  const root = await makeTree({
    "a.txt": "SAME-CONTENT",
    "sub/b.txt": "SAME-CONTENT",
    "c.txt": "DIFFERENT",
    "d.txt": "DIFFERENT",
    "empty.txt": "",
    "sub/deep/e.txt": "SAME-CONTENT",
  });
  const result = await findDuplicates(root);

  // 两组重复：SAME-CONTENT x3、DIFFERENT x2；空文件被 minSize 跳过
  assert.strictEqual(result.groups.length, 2);

  const top = result.groups.find((g) => g.files.length === 3);
  assert.ok(top, "应存在 3 份重复的一组");
  assert.strictEqual(top.files.length, 3);
  assert.strictEqual(top.hash, sha256String("SAME-CONTENT"));

  const pair = result.groups.find((g) => g.files.length === 2 && g.hash === sha256String("DIFFERENT"));
  assert.ok(pair, "应存在 2 份重复的一组");

  // 浪费字节 = SAME-CONTENT(12*2) + DIFFERENT(9*1) = 33
  assert.strictEqual(result.wastedBytes, 12 * 2 + 9 * 1);
  await fsp.rm(root, { recursive: true, force: true });
});

test("findDuplicates minSize 过滤小文件", async () => {
  const root = await makeTree({
    "small.txt": "ab",
    "copy-small.txt": "ab",
    "big.txt": "X".repeat(100),
    "copy-big.txt": "X".repeat(100),
  });
  const result = await findDuplicates(root, { minSize: 50 });
  assert.strictEqual(result.groups.length, 1);
  assert.strictEqual(result.groups[0].size, 100);
  await fsp.rm(root, { recursive: true, force: true });
});

test("findDuplicates 无重复时返回空组", async () => {
  const root = await makeTree({ "a.txt": "1", "b.txt": "2", "c.txt": "3" });
  const result = await findDuplicates(root);
  assert.strictEqual(result.groups.length, 0);
  assert.strictEqual(result.wastedBytes, 0);
  await fsp.rm(root, { recursive: true, force: true });
});

test("findDuplicates 分组按浪费空间降序排列", async () => {
  const root = await makeTree({
    "small1.bin": "S".repeat(10),
    "small2.bin": "S".repeat(10),
    "big1.bin": "B".repeat(1000),
    "big2.bin": "B".repeat(1000),
  });
  const result = await findDuplicates(root);
  assert.strictEqual(result.groups[0].size, 1000);
  assert.strictEqual(result.groups[1].size, 10);
  await fsp.rm(root, { recursive: true, force: true });
});

test("onWarn 在目录缺失时不抛出", async () => {
  const warnings = [];
  const result = await findDuplicates(path.join(os.tmpdir(), "dupscan-not-exist-xyz"), {
    onWarn: (m) => warnings.push(m),
  });
  assert.strictEqual(result.groups.length, 0);
  assert.ok(warnings.length >= 1);
});
