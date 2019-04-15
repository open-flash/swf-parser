import { ReadableByteStream, ReadableStream } from "@open-flash/stream";
import chai from "chai";
import fs from "fs";
import { IoType } from "kryo/core";
import { JsonReader } from "kryo/readers/json";
import { JsonValueWriter } from "kryo/writers/json-value";
import sysPath from "path";
import { Tag } from "swf-tree";
import { $Tag } from "swf-tree/tag";
import { DefaultParseContext } from "../lib/parse-context";
import { parseTag } from "../lib/parsers/tags";
import meta from "./meta.js";
import { readFile, readTextFile } from "./utils";

const PROJECT_ROOT: string = sysPath.join(meta.dirname, "..", "..", "..");
const TAG_SAMPLES_ROOT: string = sysPath.join(PROJECT_ROOT, "..", "tests", "tags");

const JSON_READER: JsonReader = new JsonReader();
const JSON_VALUE_WRITER: JsonValueWriter = new JsonValueWriter();

describe("tags", function () {
  for (const group of getSampleGroups()) {
    describe(group.name, function () {
      for (const sample of getSamplesFromGroup(group.name)) {
        it(sample.name, async function () {
          const inputBytes: Uint8Array = await readFile(sample.inputPath);
          const stream: ReadableByteStream = new ReadableStream(inputBytes);
          const actualValue: Tag = group.parser(stream);
          const actualJson: string = `${JSON.stringify(group.type.write(JSON_VALUE_WRITER, actualValue), null, 2)}\n`;

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
  parser(byteStream: ReadableByteStream): Tag;
}

function* getSampleGroups(): IterableIterator<SampleGroup> {
  for (const dirEnt of fs.readdirSync(TAG_SAMPLES_ROOT, {withFileTypes: true})) {
    if (!dirEnt.isDirectory()) {
      continue;
    }
    const name: string = dirEnt.name;
    yield {
      name,
      parser: (stream: ReadableByteStream) => parseTag(stream, new DefaultParseContext(10)),
      type: $Tag,
    };
  }
}

interface Sample {
  name: string;
  inputPath: string;
  valuePath: string;
}

function* getSamplesFromGroup(group: string): IterableIterator<Sample> {
  const groupPath: string = sysPath.join(TAG_SAMPLES_ROOT, group);
  for (const dirEnt of fs.readdirSync(groupPath, {withFileTypes: true})) {
    if (!dirEnt.isDirectory()) {
      continue;
    }
    const testName: string = dirEnt.name;
    const testPath: string = sysPath.join(groupPath, testName);

    const inputPath: string = sysPath.join(testPath, "input.bytes");
    const valuePath: string = sysPath.join(testPath, "value.json");

    yield {name: testName, inputPath, valuePath};
  }
}
