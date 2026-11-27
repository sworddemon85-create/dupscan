const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { findDuplicates } = require("../lib/scan");
const { spawnSync } = require("node:child_process");

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(__dirname, ".hardlink-test-"));
  const root = path.join(base, "scan");
  await fs.mkdir(root);
  t.after(async () => {
    const relative = path.relative(__dirname, base);
    assert.ok(relative.startsWith(".hardlink-test-") && !relative.includes(path.sep));
    await fs.rm(base, { recursive: true, force: true });
  });
  return { base, root };
}

test("hard-link aliases alone are not independent duplicate copies", async t => {
  const { root } = await fixture(t);
  await fs.writeFile(path.join(root, "a"), "same");
  await fs.link(path.join(root, "a"), path.join(root, "b"));
  const result = await findDuplicates(root);
  assert.equal(result.scanned, 2);
  assert.equal(result.hashed, 0);
  assert.deepEqual(result.groups, []);
  assert.equal(result.wastedBytes, 0);
});

test("independent copies are hashed once and all hard-link paths remain in the report", async t => {
  const { root } = await fixture(t);
  await fs.writeFile(path.join(root, "a"), "same");
  await fs.link(path.join(root, "a"), path.join(root, "b"));
  await fs.writeFile(path.join(root, "c"), "same");
  const result = await findDuplicates(root);
  assert.equal(result.hashed, 2);
  assert.equal(result.wastedBytes, 4);
  assert.equal(result.groups[0].files.length, 3);
  assert.deepEqual(result.groups[0].copies.map(copy => copy.files.length), [2, 1]);
  assert.equal(result.groups[0].reclaimableBytes, 4);
  const cli = spawnSync(process.execPath, [path.join(__dirname, "../cli.js"), root], { encoding: "utf8", timeout: 10000 });
  assert.ifError(cli.error);
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /4 B × 2 = 可释放 4 B/);
  assert.match(cli.stdout, /范围内 2 个路径/);
});

test("copies with links outside the scan cannot be counted as reclaimable", async t => {
  const { root, base } = await fixture(t);
  for (const name of ["a", "b", "c"]) await fs.writeFile(path.join(root, name), "same");
  for (const name of ["a", "b"]) await fs.link(path.join(root, name), path.join(base, name));
  const result = await findDuplicates(root);
  assert.equal(result.wastedBytes, 4);
  assert.deepEqual(result.groups[0].copies.map(copy => copy.externalLinks), [1, 1, 0]);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("links in ignored directories also prevent reclaiming their copies", async t => {
  const { root } = await fixture(t);
  await fs.mkdir(path.join(root, "node_modules"));
  for (const name of ["a", "b"]) {
    await fs.writeFile(path.join(root, name), "same");
    await fs.link(path.join(root, name), path.join(root, "node_modules", name));
  }
  const result = await findDuplicates(root);
  assert.equal(result.groups.length, 1);
  assert.equal(result.wastedBytes, 0);
});

test("ranking uses reclaimable copies rather than hard-link path counts", async t => {
  const { root, base } = await fixture(t);
  for (const name of ["a", "b"]) {
    await fs.writeFile(path.join(root, name), "large".repeat(100));
    await fs.link(path.join(root, name), path.join(base, name));
  }
  for (const name of ["c", "d"]) await fs.writeFile(path.join(root, name), "small");
  const result = await findDuplicates(root);
  assert.deepEqual(result.groups.map(group => group.reclaimableBytes), [5, 0]);
  assert.equal(result.wastedBytes, 5);
});
