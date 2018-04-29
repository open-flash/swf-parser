import { DocumentIoType, DocumentType } from "kryo/types/document";
import { assert } from "chai";
import { parseRect } from "../../lib/parsers/basic-data-types";
import { Stream } from "../../lib/stream";
import { readTestJson } from "../_utils";
import { readStreamJson } from "./_utils";
import { $Any } from "kryo/builtins/any";
import { $Rect, Rect } from "swf-tree/rect";
import { JsonValueReader } from "kryo/readers/json-value";

describe("parseRect", function () {
  interface Item {
    input: Stream;
    expected: {
      result: Rect;
      stream: Stream;
    };
  }

  const $Item: DocumentIoType<Item> = new DocumentType<Item>({
    properties: {
      input: {type: $Any},
      expected: {
        type: new DocumentType({
          properties: {
            result: {type: $Rect},
            stream: {type: $Any},
          },
        }),
      },
    },
  });

  const itemsJson: any[] = readTestJson("parsers/rect.json");
  const items: Item[] = [];
  for (const itemJson of itemsJson) {
    items.push({
      input: readStreamJson(itemJson.input),
      expected: {
        result: $Rect.read(new JsonValueReader(), itemJson.expected.result),
        stream: readStreamJson(itemJson.expected.stream),
      },
    });
  }

  for (let i: number = 0; i < items.length; i++) {
    const item: Item = items[i];
    it(`Should parse the rectangle in the test case ${i}`, function () {
      const actualRect: Rect = parseRect(item.input);
      assert.isTrue($Rect.equals(actualRect, item.expected.result));
      assert.isTrue(Stream.equals(item.input.tail(), item.expected.stream));
    });
  }
});
