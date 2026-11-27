const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cli = path.resolve(__dirname, "../cli.js");
function run(args, cwd) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", timeout: 10000 });
  assert.ifError(result.error);
  return result;
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(__dirname, ".cli-test-"));
  t.after(async () => {
    const relative = path.relative(__dirname, root);
    assert.ok(relative.startsWith(".cli-test-") && !relative.includes(path.sep));
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

test("invalid CLI arguments fail without emitting a scan report", async t => {
  const root = await fixture(t);
  const cases = [
    [root, "--top"],
    [root, "--ignore"],
    [root, "--min-size"],
    [root, "--top", "nope"],
    [root, "--top", "-1"],
    [root, "--top", "1.5"],
    [root, "--top", "Infinity"],
    [root, "--top", "9007199254740992"],
    [root, "--min-size", "999999999999999999999GB"],
    [root, "--ignore", "--json"],
    [root, "--top", "--json"],
    [root, "--jsno"],
    [root, root],
    ["--json"],
  ];
  for (const args of cases) {
    await t.test(args.slice(1).join(" ") || args[0], () => {
      const result = run(args);
      assert.equal(result.status, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /错误:/);
      assert.doesNotMatch(result.stderr, /发现 \d+ 个文件/);
    });
  }
});

test("missing roots and regular files fail instead of reporting zero duplicates", async t => {
  const root = await fixture(t);
  const file = path.join(root, "file.txt");
  await fs.writeFile(file, "content");
  for (const target of [path.join(root, "missing"), file]) {
    const result = run([target, "--json"]);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /错误:/);
  }
});

test("empty directories are valid and JSON stays separate from progress output", async t => {
  const root = await fixture(t);
  const result = run([root, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scanned, 0);
  assert.deepEqual(report.groups, []);
  assert.equal(report.wastedBytes, 0);
});

test("valid filters and top limits still produce the expected JSON report", async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, "ignored"));
  for (const [name, content] of Object.entries({
    "a.txt": "a".repeat(2048), "b.txt": "a".repeat(2048),
    "c.txt": "b".repeat(1600), "d.txt": "b".repeat(1600),
    "small.txt": "s", "small-copy.txt": "s",
    "ignored/copy.txt": "a".repeat(2048),
  })) await fs.writeFile(path.join(root, name), content);
  const args = [root, "--json", "--ignore", "ignored", "--min-size", "1.5KB"];
  const limited = run([...args, "--top", "1"]);
  assert.equal(limited.status, 0, limited.stderr);
  const report = JSON.parse(limited.stdout);
  assert.equal(report.groups.length, 1);
  assert.equal(report.groups[0].size, 2048);
  assert.equal(report.groups[0].files.length, 2);
  assert.equal(report.wastedBytes, 3648);
  const unlimited = run([...args, "--top", "0"]);
  assert.equal(unlimited.status, 0, unlimited.stderr);
  assert.equal(JSON.parse(unlimited.stdout).groups.length, 2);
});

test("double dash permits directory names beginning with a dash", async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, "--photos"));
  const result = run(["--json", "--", "--photos"], root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).root, "--photos");
});

test("help and no-argument usage remain successful", () => {
  for (const args of [[], ["--help"], ["-h"]]) {
    const result = run(args);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /用法:/);
  }
});
