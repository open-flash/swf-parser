const fs = require("fs");
const sysPath = require("path");

const ROOT = __dirname;

function main() {
  buildAll();
}

function buildAll() {
  for (const dirEnt of fs.readdirSync(ROOT, {withFileTypes: true})) {
    if (!dirEnt.isDirectory()) {
      continue;
    }
    const groupName = dirEnt.name;
    const groupPath = sysPath.join(ROOT, groupName);
    for (const dirEnt of fs.readdirSync(groupPath, {withFileTypes: true})) {
      if (!dirEnt.isDirectory()) {
        continue;
      }
      const testName = dirEnt.name;
      const testPath = sysPath.join(groupPath, testName);
      for (const f of ["input", "output"]) {
        const srcPath = sysPath.join(testPath, "src", `${f}.txt`);
        const dstPath = sysPath.join(testPath, `${f}.bytes`);
        try {
          const stats = fs.statSync(srcPath);
          if (!stats.isFile()) {
            continue;
          }
        } catch (err) {
          if (err.code === "ENOENT") {
            continue;
          } else {
            throw err;
          }
        }
        console.log(`${groupName}/${testName}/${f}`);
        build(srcPath, dstPath);
      }
    }
  }
}

function build(srcPath, dstPath) {
  const text = fs.readFileSync(srcPath, {encoding: "UTF-8"});
  const bytes = bytesFromSource(text);
  fs.writeFileSync(dstPath, bytes);
}

function bytesFromSource(text /* string */) /* Uint8Array */ {
  if (text.startsWith("# bin\n")) {
    return bytesFromBinSource(text);
  } else {
    return bytesFromHexSource(text);
  }
}

function bytesFromHexSource(text /* string */) /* Uint8Array */ {
  const clean /* string */ = text
    .replace(/#[\S\s]*?(?:\n|$)/g, "")
    .replace(/[^0-9a-f]/g, "");
  if (clean.length % 2 !== 0) {
    throw new Error("InvalidHexSource: symbol count must be a multiple of 2");
  }
  return Buffer.from(clean, "hex");
}

function bytesFromBinSource(text /* string */) /* Uint8Array */ {
  const clean /* string */ = text
    .replace(/#[\S\s]*?(?:\n|$)/g, "")
    .replace(/[^01]/g, "");
  if (clean.length % 8 !== 0) {
    throw new Error("InvalidBinSource: symbol count must be a multiple of 8");
  }
  const len /* UintSize */ = clean.length / 8;
  const bytes /* Buffer */ = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      if (clean[8 * i + j] === "1") {
        byte |= 1 << (7 - j);
      }
    }
    bytes[i] = byte;
  }
  return bytes;
}

main();
