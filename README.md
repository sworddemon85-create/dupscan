# 🔍 dupscan

[![CI](https://github.com/sworddemon85-create/dupscan/actions/workflows/ci.yml/badge.svg)](https://github.com/sworddemon85-create/dupscan/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Zero deps](https://img.shields.io/badge/dependencies-0-brightgreen)](package.json)

**零依赖的重复文件扫描器**：按内容 SHA-256 判重，帮你找出下载文件夹/相册里占空间的重复文件。

> A zero-dependency duplicate file finder. Content-hash based (SHA-256), with two-stage size-bucket optimization so most files never get hashed.

## ✨ 特性

- **内容判重，不看文件名** — 改过名、挪过位置的重复文件照样找出来
- **两段式优化** — 先按文件大小分桶（大小不同必不重复），只对同大小的候选算哈希，快得多
- **流式哈希** — 1MB 分块读取，几 GB 的大文件也不会撑爆内存
- **零依赖** — 只用 Node 内置模块，克隆即用；自动忽略 `node_modules`/`.git`
- **JSON 报告** — `--json` 输出结构化结果，方便接脚本做后续清理

## 🚀 用法

```bash
git clone https://github.com/sworddemon85-create/dupscan.git
cd dupscan

# 扫描一个目录
node cli.js D:\Download

# 只看不小于 10MB 的文件，显示浪费空间最大的 5 组
node cli.js D:\Download --min-size 10MB --top 5

# 导出 JSON 报告
node cli.js D:\Download --json > dup-report.json

# 作为库使用
node -e "require('./lib/scan').findDuplicates('D:\\\\Download').then(r => console.log(r.wastedBytes))"
```

示例输出：

```
扫描目录: D:\Download
文件总数: 1284（其中 96 个计算了哈希）
重复组数: 12
可释放空间: 1.4 GB

#1 52.3 MB × 3 = 可释放 104.6 MB
    D:\Download\视频\final.mp4
    D:\Download\视频\final (1).mp4
    D:\Download\备份\final_copy.mp4
```

## 🧪 测试

```bash
npm test    # node --test，8 个用例
```

覆盖：递归遍历与忽略规则、哈希正确性、内容分组、minSize 过滤、排序、缺失目录容错。

## 📁 结构

```
dupscan/
├── lib/
│   ├── walk.js    # 递归遍历（忽略 node_modules/.git，跳过符号链接）
│   ├── hash.js    # 流式 SHA-256
│   └── scan.js    # 两段式查重：大小分桶 → 哈希分组
├── cli.js         # 命令行入口
└── test/          # node:test 单元测试
```

## ⚠️ 设计取舍

- **只报告，不删文件**：清理动作留给用户或你自己的脚本（配 `--json` 很好写）
- 符号链接一律跳过，避免循环遍历
- Windows 下建议在终端执行 `chcp 65001` 以正确显示中文输出

## 📄 许可证

[MIT](LICENSE)
