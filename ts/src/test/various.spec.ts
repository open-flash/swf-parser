import { ReadableByteStream, ReadableStream } from "@open-flash/stream";
import chai from "chai";
import fs from "fs";
import { $Uint32 } from "kryo/builtins/uint32";
import { IoType } from "kryo/core";
import { JsonReader } from "kryo/readers/json";
import { JsonValueWriter } from "kryo/writers/json-value";
import sysPath from "path";
import { $Header } from "swf-tree/header";
import { $Matrix } from "swf-tree/matrix";
import { $Rect } from "swf-tree/rect";
import { $SwfSignature } from "swf-tree/swf-signature";
import { parseMatrix, parseRect } from "../lib/parsers/basic-data-types";
import { parseHeader, parseSwfSignature } from "../lib/parsers/header";
import meta from "./meta.js";
import { readFile, readTextFile } from "./utils";

const PROJECT_ROOT: string = sysPath.join(meta.dirname, "..", "..", "..");
const SAMPLES_ROOT: string = sysPath.join(PROJECT_ROOT, "..", "tests", "various");

const JSON_READER: JsonReader = new JsonReader();
const JSON_VALUE_WRITER: JsonValueWriter = new JsonValueWriter();

for (const group of getSampleGroups()) {
  describe(group.name, function () {
    for (const sample of getSamplesFromGroup(group.name)) {
      it(sample.name, async function () {
        const inputBytes: Uint8Array = await readFile(sample.inputPath);
        const stream: ReadableByteStream = new ReadableStream(inputBytes);
        const actualValue: any = group.parser(stream);
        const actualJson: string = `${JSON.stringify(group.type.write(JSON_VALUE_WRITER, actualValue), null, 2)}\n`;

        chai.assert.isUndefined(group.type.testError!(actualValue));

        const expectedJson: string = await readTextFile(sample.valuePath);
        const expectedValue: any = group.type.read(JSON_READER, expectedJson);

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

interface SampleGroup<T> {
  name: string;
  type: IoType<T>;
  parser(byteStream: ReadableByteStream): T;
}

function* getSampleGroups(): IterableIterator<SampleGroup<any>> {
  for (const dirEnt of fs.readdirSync(SAMPLES_ROOT, {withFileTypes: true})) {
    if (!dirEnt.isDirectory()) {
      continue;
    }
    const name: string = dirEnt.name;
    switch (name) {
      case "header": {
        yield {name, parser: (stream: ReadableByteStream) => parseHeader(stream, 34), type: $Header};
        break;
      }
      case "matrix": {
        yield {name, parser: parseMatrix, type: $Matrix};
        break;
      }
      case "rect": {
        yield {name, parser: parseRect, type: $Rect};
        break;
      }
      case "swf-signature": {
        yield {name, parser: parseSwfSignature, type: $SwfSignature};
        break;
      }
      case "uint32-leb128": {
        yield {
          name,
          parser: (stream: ReadableByteStream) => stream.readUint32Leb128(),
          type: $Uint32,
        };
        break;
      }
      default:
        throw new Error(`Unknown sample group: ${name}`);
    }
  }
}

interface Sample {
  name: string;
  inputPath: string;
  valuePath: string;
}

function* getSamplesFromGroup(group: string): IterableIterator<Sample> {
  const groupPath: string = sysPath.join(SAMPLES_ROOT, group);
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
