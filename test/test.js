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
  // ["rs", rsParse],
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
    const expected = testItem.expected;
    for (const [parserName, parser] of PARSERS) {
      const actual = parser(testItem.inputPath);
      fs.writeFileSync(sysPath.join(testItem.dir, `${parserName}.actual.json`), actual);
      if (equalBuffers(actual, expected)) {
        console.log(`  ${parserName.padEnd(10, " ")} OK`);
      } else {
        const expectedTree = JSON.parse(expected.toString("UTF-8"));
        const actualTree = JSON.parse(actual.toString("UTF-8"));
        if (similarJsonValues(actualTree, expectedTree)) {
          console.log(`  ${parserName.padEnd(10, " ")} OK (similar)`);
        } else {
          const diff = diffSwfTrees(expectedTree, actualTree);
          console.log(`  ${parserName.padEnd(10, " ")} ERR`);
          console.log(`    ${diff}`);
        }
      }
    }
  }
}

function equalBuffers(actual, expected) {
  if (actual.length !== expected.length) {
    return false;
  }
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      return false;
    }
  }
  return true;
}

function diffSwfTrees(oldTree, newTree) {
  if (!equalJsonValues(newTree.header, oldTree.header)) {
    return "Different header";
  }

  const differentTags = [];
  for (let i = 0; i < oldTree.tags.length; i++) {
    const newTag = newTree.tags[i];
    const oldTag = oldTree.tags[i];
    if (newTag === undefined) {
      break;
    }
    if (!equalJsonValues(newTag, oldTag)) {
      differentTags.push(i.toString(10));
    }
  }
  if (differentTags.length > 0) {
    return `Different tags: ${differentTags.join(", ")}`;
  } else if (newTree.tags < oldTree.tags.length) {
    return "Not enough tags"
  } else if (newTree.tags > oldTree.tags.length) {
    return "Too much tags"
  }

  return "Unknown difference";
}

function equalJsonValues(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected)
}

function similarJsonValues(actual, expected) {
  switch (typeof expected) {
    case "boolean":
    case "string":
      return actual === expected;
    case "number":
      if (Object.is(actual, expected)) {
        return true;
      } else {
        const absDelta = Math.abs(actual - expected);
        return Math.abs(absDelta / actual) < 0.001 && Math.abs(absDelta / expected) < 0.001;
      }
    case "array":
      if (actual.length !== expected.length) {
        return false;
      }
      for (let i = 0; i < expected.length; i++) {
        if (!similarJsonValues(actual[i], expected[i])) {
          return false;
        }
      }
      return true;
    case "object":
      if (expected === null || actual === null) {
        return actual === expected;
      }
      const actualKeys = Object.keys(actual);
      const expectedKeys = Object.keys(expected);
      if (actualKeys.length !== expectedKeys.length) {
        return false;
      }
      for (let i = 0; i < expectedKeys.length; i++) {
        if (actualKeys[i] !== expectedKeys[i]) {
          return false;
        }
        const key = expectedKeys[i];
        if (!similarJsonValues(actual[key], expected[key])) {
          return false;
        }
      }
      return true;
    default:
      return false;
  }
}

main();
