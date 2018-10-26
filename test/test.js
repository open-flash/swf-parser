const cp = require("child_process");
const fs = require("fs");
const sysPath = require("path");

const PROJECT_ROOT = sysPath.resolve(__dirname, "..");
const TEST_ITEMS_PATH = sysPath.join(PROJECT_ROOT, "test", "end-to-end");
const SWF_PARSER_RS = sysPath.join(PROJECT_ROOT, "swf-parser.rs", "target", "debug", "swf-parser");
const SWF_PARSER_TS = sysPath.join(PROJECT_ROOT, "swf-parser.ts", "build", "main", "main", "main.js");

function rsParse(swfPath) {
  const result = cp.spawnSync(SWF_PARSER_RS, [swfPath]);
  if (result.status !== 0 || result.signal !== null) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error("Parser failed");
  }
  return result.stdout;
}

function tsParse(swfPath) {
  const result = cp.spawnSync(process.execPath, [SWF_PARSER_TS, swfPath]);
  if (result.status !== 0 || result.signal !== null) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error("Parser failed");
  }
  return result.stdout;
}

const PARSERS = new Map([
  ["rs", rsParse],
  ["ts", tsParse],
]);

function getTestItems() {
  return [...getTestItemsFrom(TEST_ITEMS_PATH)];

  function* getTestItemsFrom(dir) {
    const children = fs.readdirSync(dir, {withFileTypes: true});
    for (const child of children) {
      if (!child.isDirectory()) {
        continue;
      }
      const testItem = tryGetTestItem(sysPath.join(dir, child.name));
      if (testItem !== undefined) {
        yield testItem;
      }
    }
  }
}

function tryGetTestItem(dir) {
  const metaPath = sysPath.join(dir, "meta.json");
  let metaBuffer;
  try {
    metaBuffer = fs.readFileSync(metaPath);
  } catch (err) {
    if (err.code === "ENOENT") {
      return undefined;
    } else {
      throw err;
    }
  }
  const meta = JSON.parse(metaBuffer.toString("UTF-8"));
  const inputPath = sysPath.join(dir, "main.swf");
  const expected = fs.readFileSync(sysPath.join(dir, "expected.json"));
  const name = meta.name !== undefined ? meta.name : sysPath.basename(dir);

  return {
    name,
    description: meta.description,
    dir,
    inputPath,
    expected,
  }
}

function main() {
  for (const testItem of getTestItems()) {
    console.log(testItem.name);
    if (testItem.description !== undefined) {
      console.log(testItem.description);
    }
    for (const [parserName, parser] of PARSERS) {
      const actual = parser(testItem.inputPath);
      fs.writeFileSync(sysPath.join(testItem.dir, `${parserName}.actual.json`), actual);
      const isOk = equalBuffers(actual, testItem.expected);
      if (isOk) {
        console.log(`  ${parserName.padEnd(10, " ")} OK`);
      } else {
       console.log(`  ${parserName.padEnd(10, " ")} ERR`);
      }
    }
  }
}

function equalBuffers(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

main();
