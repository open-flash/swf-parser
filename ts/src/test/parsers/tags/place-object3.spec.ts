import { ReadableStream } from "@open-flash/stream";
import chai from "chai";
import { JsonValueReader } from "kryo/readers/json-value";
import { JsonValueWriter } from "kryo/writers/json-value";
import { $PlaceObject, PlaceObject } from "swf-tree/tags";
import { parsePlaceObject3 } from "../../../lib/parsers/tags";
import { readTestJson } from "../../_utils";
import { readStreamJson, StreamJson } from "../_utils";

const JSON_VALUE_READER: JsonValueReader = new JsonValueReader();
const JSON_VALUE_WRITER: JsonValueWriter = new JsonValueWriter();

describe("tags.parsePlaceObject3", function () {
  interface Item {
    input: ReadableStream;
    expected: {
      result: PlaceObject;
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

  const itemsJson: ItemJson[] = readTestJson("parsers/tags/place-object3.json") as ItemJson[];
  const items: Item[] = [];
  for (const itemJson of itemsJson) {
    items.push({
      input: readStreamJson(itemJson.input),
      expected: {
        result: $PlaceObject.read(JSON_VALUE_READER, itemJson.expected.result),
        stream: readStreamJson(itemJson.expected.stream),
      },
    });
  }

  for (let i: number = 0; i < items.length; i++) {
    const item: Item = items[i];
    it(`Should parse the PlaceObject tag in the test case ${i}`, function () {
      const actual: PlaceObject = parsePlaceObject3(item.input, 8);
      // console.warn("Ignoring equality test due to floats");
      chai.assert.deepEqual(
        $PlaceObject.write(JSON_VALUE_WRITER, actual),
        $PlaceObject.write(JSON_VALUE_WRITER, item.expected.result),
      );
      chai.assert.isTrue($PlaceObject.equals(actual, item.expected.result));
      chai.assert.isTrue(ReadableStream.equals(item.input.tail(), item.expected.stream));
    });
  }
});
