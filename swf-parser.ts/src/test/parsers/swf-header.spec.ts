import {assert} from "chai";
import {SwfHeader} from "../../lib/ast/header/swf-header";
import {parseSwfHeader} from "../../lib/parsers/header";
import {Stream} from "../../lib/stream";
import {readTestJson} from "../_utils";
import {readStreamJson, StreamJson} from "./_utils";

describe("parseSwfHeader", function () {
  interface Item {
    input: Stream;
    expected: {
      result: SwfHeader;
      stream: Stream;
    };
  }

  interface ItemJson {
    input: StreamJson;
    expected: {
      result: SwfHeader.Json;
      stream: StreamJson;
    };
  }

  const itemsJson: ItemJson[] = readTestJson("parsers/swf-header.json") as ItemJson[];
  const items: Item[] = [];
  for (const itemJson of itemsJson) {
    items.push({
      input: readStreamJson(itemJson.input),
      expected: {
        result: SwfHeader.type.read("json", itemJson.expected.result),
        stream: readStreamJson(itemJson.expected.stream),
      },
    });
  }

  for (let i: number = 0; i < items.length; i++) {
    const item: Item = items[i];
    it(`Should parse the swfHeader in the test case ${i}`, function () {
      const actual: SwfHeader = parseSwfHeader(item.input);
      assert.isTrue(SwfHeader.type.equals(actual, item.expected.result));
      assert.deepEqual(item.input.tail(), item.expected.stream);
    });
  }
});
