import {assert} from "chai";
import {Rect} from "../../lib/ast/basic-types/rect";
import {parseRect} from "../../lib/parsers/basic-data-types";
import {Stream} from "../../lib/stream";
import {readTestJson} from "../_utils";
import {readStreamJson, StreamJson} from "./_utils";

describe("parseRect", function () {
  interface Item {
    input: Stream;
    expected: {
      result: Rect;
      stream: Stream;
    };
  }

  interface ItemJson {
    input: StreamJson;
    expected: {
      result: Rect.Json;
      stream: StreamJson;
    };
  }

  const itemsJson: ItemJson[] = readTestJson("parsers/rect.json") as ItemJson[];
  const items: Item[] = [];
  for (const itemJson of itemsJson) {
    items.push({
      input: readStreamJson(itemJson.input),
      expected: {
        result: Rect.type.read("json", itemJson.expected.result),
        stream: readStreamJson(itemJson.expected.stream),
      },
    });
  }

  for (let i: number = 0; i < items.length; i++) {
    const item: Item = items[i];
    it(`Should parse the rectangle in the test case ${i}`, function () {
      const actualRect: Rect = parseRect(item.input);
      assert.isTrue(Rect.type.equals(actualRect, item.expected.result));
      assert.deepEqual(item.input.tail(), item.expected.stream);
    });
  }
});
