import { ReadableStream } from "@open-flash/stream";
import chai from "chai";
import { JsonValueReader } from "kryo/readers/json-value";
import { JsonValueWriter } from "kryo/writers/json-value";
import { $DefineSprite, DefineSprite } from "swf-tree/tags";
import { DefaultParseContext } from "../../../lib/parse-context";
import { parseDefineSprite } from "../../../lib/parsers/tags";
import { readTestJson } from "../../_utils";
import { readStreamJson, StreamJson } from "../_utils";

const JSON_VALUE_READER: JsonValueReader = new JsonValueReader();
const JSON_VALUE_WRITER: JsonValueWriter = new JsonValueWriter();

describe("tags.defineSprite", function () {
  interface Item {
    input: ReadableStream;
    expected: {
      result: DefineSprite;
      stream: ReadableStream;
    };
  }

  interface ItemJson {
    input: StreamJson;
    expected: {
      result: any;
      stream: StreamJson;
    };
  }

  const itemsJson: ItemJson[] = readTestJson("parsers/tags/define-sprite.json") as ItemJson[];
  const items: Item[] = [];
  for (const itemJson of itemsJson) {
    items.push({
      input: readStreamJson(itemJson.input),
      expected: {
        result: $DefineSprite.read(JSON_VALUE_READER, itemJson.expected.result),
        stream: readStreamJson(itemJson.expected.stream),
      },
    });
  }

  for (let i: number = 0; i < items.length; i++) {
    const item: Item = items[i];
    it(`Should parse the DefineSprite tag in the test case ${i}`, function () {
      const actual: DefineSprite = parseDefineSprite(item.input, new DefaultParseContext(8));
      chai.assert.deepEqual(
        $DefineSprite.write(JSON_VALUE_WRITER, actual),
        $DefineSprite.write(JSON_VALUE_WRITER, item.expected.result),
      );
      chai.assert.isTrue($DefineSprite.equals(actual, item.expected.result));
      chai.assert.isTrue(ReadableStream.equals(item.input.tail(), item.expected.stream));
    });
  }
});
