import {assert} from "chai";
import {Header} from "swf-tree";
import {parseHeader} from "../../lib/parsers/header";
import {Stream} from "../../lib/stream";
import {readTestJson} from "../_utils";
import {readStreamJson, StreamJson} from "./_utils";

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
      result: Header.Json;
      stream: StreamJson;
    };
  }

  const itemsJson: ItemJson[] = readTestJson("parsers/swf-header.json") as ItemJson[];
  const items: Item[] = [];
  for (const itemJson of itemsJson) {
    items.push({
      input: readStreamJson(itemJson.input),
      expected: {
        result: Header.type.read("json", itemJson.expected.result),
        stream: readStreamJson(itemJson.expected.stream),
      },
    });
  }

  for (let i: number = 0; i < items.length; i++) {
    const item: Item = items[i];
    it(`Should parse the Header in the test case ${i}`, function () {
      const actual: Header = parseHeader(item.input);
      assert.isTrue(Header.type.equals(actual, item.expected.result));
      assert.deepEqual(item.input.tail(), item.expected.stream);
    });
  }
});
