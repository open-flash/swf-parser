import { ReadableStream } from "@open-flash/stream";
import chai from "chai";
import { JsonValueReader } from "kryo/readers/json-value";
import { $Rect, Rect } from "swf-tree/rect";
import { parseRect } from "../../lib/parsers/basic-data-types";
import { readTestJson } from "../_utils";
import { readStreamJson } from "./_utils";

describe("parseRect", function () {
  interface Item {
    input: ReadableStream;
    expected: {
      result: Rect;
      stream: ReadableStream;
    };
  }

  // const $Item: DocumentIoType<Item> = new DocumentType<Item>({
  //   properties: {
  //     input: {type: $Any},
  //     expected: {
  //       type: new DocumentType({
  //         properties: {
  //           result: {type: $Rect},
  //           stream: {type: $Any},
  //         },
  //       }),
  //     },
  //   },
  // });

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
      chai.assert.isTrue($Rect.equals(actualRect, item.expected.result));
      chai.assert.isTrue(ReadableStream.equals(item.input.tail(), item.expected.stream));
    });
  }
});
