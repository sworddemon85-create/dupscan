/** 文件 SHA-256：流式读取，大文件也不会撑爆内存。 */

const crypto = require("crypto");
const fs = require("fs");

const CHUNK = 1024 * 1024; // 1MB

/**
 * @param {string} filePath
 * @returns {Promise<string>} 十六进制摘要
 */
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath, { highWaterMark: CHUNK });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** 字符串 SHA-256（测试与工具用途）。 */
function sha256String(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

module.exports = { sha256File, sha256String };
