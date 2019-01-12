import chai from "chai";
import { Uint32 } from "semantic-types";
import { Stream } from "../../lib/stream";
import { readTestJson } from "../_utils";
import { readStreamJson, StreamJson } from "./_utils";

describe("readEncodedUint32LE", function () {
  interface Item {
    input: Stream;
    expected: {
      result: Uint32;
      stream: Stream;
    };
  }

  interface ItemJson {
    input: StreamJson;
    expected: {
      result: number;
      stream: StreamJson;
    };
  }

  const itemsJson: ItemJson[] = readTestJson("parsers/uint32-leb128.json") as ItemJson[];
  const items: Item[] = [];
  for (const itemJson of itemsJson) {
    items.push({
      input: readStreamJson(itemJson.input),
      expected: {
        result: itemJson.expected.result,
        stream: readStreamJson(itemJson.expected.stream),
      },
    });
  }

  for (let i: number = 0; i < items.length; i++) {
    const item: Item = items[i];
    it(`Should parse the encoded Uint32 in the test case ${i}`, function () {
      const actual: number = item.input.readUint32Leb128();
      chai.assert.deepEqual(actual, item.expected.result);
      chai.assert.isTrue(Stream.equals(item.input.tail(), item.expected.stream));
    });
  }
});
