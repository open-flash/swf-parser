import chai from "chai";
import { JsonValueReader } from "kryo/readers/json-value";
import { tags } from "swf-tree";
import { parsePlaceObject3 } from "../../../lib/parsers/tags";
import { Stream } from "../../../lib/stream";
import { readTestJson } from "../../_utils";
import { readStreamJson, StreamJson } from "../_utils";

const JSON_VALUE_READER: JsonValueReader = new JsonValueReader();

describe("tags.parsePlaceObject3", function () {
  interface Item {
    input: Stream;
    expected: {
      result: tags.PlaceObject;
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

  const itemsJson: ItemJson[] = readTestJson("parsers/tags/place-object3.json") as ItemJson[];
  const items: Item[] = [];
  for (const itemJson of itemsJson) {
    items.push({
      input: readStreamJson(itemJson.input),
      expected: {
        result: tags.$PlaceObject.read(JSON_VALUE_READER, itemJson.expected.result),
        stream: readStreamJson(itemJson.expected.stream),
      },
    });
  }

  for (let i: number = 0; i < items.length; i++) {
    const item: Item = items[i];
    it(`Should parse the Header in the test case ${i}`, function () {
      const actual: tags.PlaceObject = parsePlaceObject3(item.input, 8);
      // console.warn("Ignoring equality test due to floats");
      chai.assert.isTrue(tags.$PlaceObject.equals(actual, item.expected.result));
      chai.assert.isTrue(Stream.equals(item.input.tail(), item.expected.stream));
    });
  }
});
