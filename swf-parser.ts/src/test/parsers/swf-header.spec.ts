import { assert } from "chai";
import { parseHeader } from "../../lib/parsers/header";
import { Stream } from "../../lib/stream";
import { readTestJson } from "../_utils";
import { readStreamJson, StreamJson } from "./_utils";
import { $Header, Header } from "swf-tree/header";
import { JsonValueReader } from "kryo/readers/json-value";

const JSON_VALUE_READER = new JsonValueReader();

describe("parseHeader", function () {
  interface Item {
    input: Stream;
    expected: {
      result: Header;
      stream: Stream;
    };
  }

  interface ItemJson {
    input: StreamJson;
    expected: {
      result: any;
      stream: StreamJson;
    };
  }

  const itemsJson: ItemJson[] = readTestJson("parsers/swf-header.json") as ItemJson[];
  const items: Item[] = [];
  for (const itemJson of itemsJson) {
    items.push({
      input: readStreamJson(itemJson.input),
      expected: {
        result: $Header.read(JSON_VALUE_READER, itemJson.expected.result),
        stream: readStreamJson(itemJson.expected.stream),
      },
    });
  }

  for (let i: number = 0; i < items.length; i++) {
    const item: Item = items[i];
    it(`Should parse the Header in the test case ${i}`, function () {
      const actual: Header = parseHeader(item.input);
      assert.isTrue($Header.equals(actual, item.expected.result), "Header equality failed");
      assert.isTrue(Stream.equals(item.input.tail(), item.expected.stream), "Stream equality failed");
    });
  }
});
