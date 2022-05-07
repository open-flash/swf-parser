import { ReadableStream, ReadableByteStream } from "@open-flash/stream";
import chai from "chai";
import fs from "fs";
import { IoType } from "kryo";
import { JSON_READER } from "kryo-json/json-reader";
import { JSON_VALUE_WRITER } from "kryo-json/json-value-writer";
import { Float64Type } from "kryo/float64";
import { $Uint32 } from "kryo/integer";
import sysPath from "path";
import { $ColorTransformWithAlpha } from "swf-types/color-transform-with-alpha";
import { $Header } from "swf-types/header";
import { $Matrix } from "swf-types/matrix";
import { $Rect } from "swf-types/rect";
import { $SwfSignature } from "swf-types/swf-signature";

import { parseColorTransformWithAlpha, parseMatrix, parseRect } from "../lib/parsers/basic-data-types.mjs";
import { parseHeader, parseSwfSignature } from "../lib/parsers/header.mjs";
import meta from "./meta.mjs";
import { readFile, readTextFile } from "./utils.mjs";

const PROJECT_ROOT: string = sysPath.join(meta.dirname, "..");
const SAMPLES_ROOT: string = sysPath.join(PROJECT_ROOT, "..", "tests", "various");

for (const group of getSampleGroups()) {
  describe(group.name, function () {
    for (const sample of getSamplesFromGroup(group.name)) {
      it(sample.name, async function () {
        const inputBytes: Uint8Array = await readFile(sample.inputPath);
        const s: ReadableByteStream = new ReadableStream(inputBytes);
        const actualValue: any = group.parser(s);
        const actualJson: string = `${JSON.stringify(group.type.write(JSON_VALUE_WRITER, actualValue), null, 2)}\n`;

        // await writeTextFile(sample.valuePath, actualJson);

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
      case "color-transform-with-alpha": {
        yield {name, parser: parseColorTransformWithAlpha, type: $ColorTransformWithAlpha};
        break;
      }
      case "float16-le": {
        yield {
          name,
          parser: (stream: ReadableByteStream) => stream.readFloat16LE(),
          type: new Float64Type(),
        };
        break;
      }
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
