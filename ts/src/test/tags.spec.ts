import stream, { ReadableByteStream } from "@open-flash/stream";
import chai from "chai";
import fs from "fs";
import { IoType } from "kryo";
import { JSON_READER } from "kryo-json/lib/json-reader.js";
import { JSON_VALUE_WRITER } from "kryo-json/lib/json-value-writer.js";
import sysPath from "path";
import { $Tag,Tag } from "swf-types/lib/tag.js";

import { parseTag } from "../lib/parsers/tags.js";
import meta from "./meta.js";
import { readFile, readTextFile } from "./utils.js";

const PROJECT_ROOT: string = sysPath.join(meta.dirname, "..");
const TAG_SAMPLES_ROOT: string = sysPath.join(PROJECT_ROOT, "..", "tests", "tags");

// `BLACKLIST` can be used to forcefully skip some tests.
const BLACKLIST: ReadonlySet<string> = new Set([
  // "define-shape/shape1-squares",
  // "raw-body/invalid-define-font-offset",
  // "raw-body/non-utf8-string",
]);
// `WHITELIST` can be used to only enable a few tests.
const WHITELIST: ReadonlySet<string> = new Set([
  // "place-object/po2-place-id-1",
  // "place-object/po3-update-depth-1",
]);

describe("tags", function () {
  for (const group of getSampleGroups()) {
    describe(group.name, function () {
      for (const sample of getSamplesFromGroup(group)) {
        it(sample.name, async function () {
          const inputBytes: Uint8Array = await readFile(sample.inputPath);
          const s: ReadableByteStream = new stream.ReadableStream(inputBytes);
          const actualValue: Tag = sample.parser(s);
          const actualJson: string = `${JSON.stringify(group.type.write(JSON_VALUE_WRITER, actualValue), null, 2)}\n`;

          // await writeTextFile(sample.valuePath, actualJson);

          chai.assert.isUndefined(group.type.testError!(actualValue));

          const expectedJson: string = await readTextFile(sample.valuePath);
          const expectedValue: Tag = group.type.read(JSON_READER, expectedJson);

          try {
            chai.assert.isTrue(group.type.equals(actualValue, expectedValue));
          } catch (err) {
            chai.assert.strictEqual(actualJson, expectedJson);
            throw err;
          }
        });
      }
    });
  }
});

interface SampleGroup {
  name: string;
  type: IoType<Tag>;
}

function* getSampleGroups(): IterableIterator<SampleGroup> {
  for (const dirEnt of fs.readdirSync(TAG_SAMPLES_ROOT, {withFileTypes: true})) {
    if (!dirEnt.isDirectory()) {
      continue;
    }
    const name: string = dirEnt.name;
    yield {
      name,
      type: $Tag,
    };
  }
}

interface Sample {
  name: string;
  inputPath: string;
  valuePath: string;

  parser(byteStream: ReadableByteStream): Tag;
}

function* getSamplesFromGroup(group: SampleGroup): IterableIterator<Sample> {
  const groupPath: string = sysPath.join(TAG_SAMPLES_ROOT, group.name);
  for (const dirEnt of fs.readdirSync(groupPath, {withFileTypes: true})) {
    if (!dirEnt.isDirectory()) {
      continue;
    }
    const testName: string = dirEnt.name;
    const testPath: string = sysPath.join(groupPath, testName);
    const fullName: string = `${group.name}/${testName}`;

    if (BLACKLIST.has(fullName)) {
      continue;
    } else if (WHITELIST.size > 0 && !WHITELIST.has(fullName)) {
      continue;
    }

    const inputPath: string = sysPath.join(testPath, "input.bytes");
    const valuePath: string = sysPath.join(testPath, "value.json");

    let swfVersion: number;
    switch (fullName) {
      case "place-object/po2-swf5":
        swfVersion = 5;
        break;
      default:
        swfVersion = 10;
        break;
    }

    yield {
      name: testName,
      inputPath,
      valuePath,
      parser: (stream: ReadableByteStream) => parseTag(stream, swfVersion)!,
    };
  }
}
