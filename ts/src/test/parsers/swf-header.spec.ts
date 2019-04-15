import { ReadableStream } from "@open-flash/stream";
import chai from "chai";
import { JsonValueReader } from "kryo/readers/json-value";
import { $Header, Header } from "swf-tree/header";
import { parseHeader } from "../../lib/parsers/header";
import { readTestJson } from "../utils";
import { readStreamJson, StreamJson } from "./_utils";

const JSON_VALUE_READER: JsonValueReader = new JsonValueReader();

describe("parseHeader", function () {
  interface Item {
    input: ReadableStream;
    expected: {
      result: Header;
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
      chai.assert.isTrue($Header.equals(actual, item.expected.result), "Header equality failed");
      chai.assert.isTrue(ReadableStream.equals(item.input.tail(), item.expected.stream), "Stream equality failed");
    });
  }
});
