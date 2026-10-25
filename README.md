# 🔍 dupscan

**English** | [中文](README.zh-CN.md)

[![CI](https://github.com/sworddemon85-create/dupscan/actions/workflows/ci.yml/badge.svg)](https://github.com/sworddemon85-create/dupscan/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Zero deps](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

**A zero-dependency duplicate file finder.** Matches files by content (SHA-256), so renamed or moved copies are still detected — with a two-stage size-bucket optimization so most files never get hashed at all.

## ✨ Features

- **Content-based matching** — file names don't matter; identical bytes are identical files
- **Two-stage scan** — files are first bucketed by size (different sizes can't be duplicates); only same-size candidates get hashed, which is dramatically faster
- **Streaming hashing** — 1MB chunks keep memory flat even on multi-GB files
- **Zero dependencies** — Node.js built-ins only; clone and run
- **JSON reports** — `--json` output plugs straight into your cleanup scripts
- **Sensible defaults** — skips `node_modules`/`.git` and symlinks automatically

## 🚀 Usage

```bash
git clone https://github.com/sworddemon85-create/dupscan.git
cd dupscan

# scan a directory
node cli.js D:\Download

# only files >= 10MB, show the 5 most wasteful groups
node cli.js D:\Download --min-size 10MB --top 5

# export a JSON report
node cli.js D:\Download --json > dup-report.json

# use as a library
node -e "require('./lib/scan').findDuplicates('D:\\\\Download').then(r => console.log(r.wastedBytes))"
```

Example output:

```
Scanned:  1284 files (96 hashed)
Groups:   12 duplicate groups
Reclaimable: 1.4 GB

#1 52.3 MB × 3 = reclaim 104.6 MB
    D:\Download\video\final.mp4
    D:\Download\video\final (1).mp4
    D:\Download\backup\final_copy.mp4
```

## 🧪 Tests

```bash
npm test    # node --test — 8 unit tests
```

Covers: recursive walk and ignore rules, hash correctness, content grouping, minSize filtering, sort order, missing-directory resilience.

## 📁 Structure

```
dupscan/
├── lib/
│   ├── walk.js    # recursive walk (ignores node_modules/.git, skips symlinks)
│   ├── hash.js    # streaming SHA-256
│   └── scan.js    # two-stage scan: size buckets → hash groups
├── cli.js         # command-line entry
└── test/          # node:test unit tests
```

## ⚠️ Design choices

- **Report-only** — it never deletes anything; cleanup is left to you or your scripts (pairs well with `--json`)
- Symlinks are always skipped to avoid cyclic walks
- On Windows, run `chcp 65001` first for correct non-ASCII output in legacy consoles

## 📄 License

[MIT](LICENSE)
