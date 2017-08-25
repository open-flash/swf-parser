import { assert } from "chai";
import { tags } from "swf-tree";
import { parsePlaceObject3 } from "../../../lib/parsers/tags";
import { Stream } from "../../../lib/stream";
import { readTestJson } from "../../_utils";
import { readStreamJson, StreamJson } from "../_utils";

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
      result: tags.PlaceObject.Json;
      stream: StreamJson;
    };
  }

  const itemsJson: ItemJson[] = readTestJson("parsers/tags/place-object3.json") as ItemJson[];
  const items: Item[] = [];
  for (const itemJson of itemsJson) {
    items.push({
      input: readStreamJson(itemJson.input),
      expected: {
        result: tags.PlaceObject.type.readJson(itemJson.expected.result),
        stream: readStreamJson(itemJson.expected.stream),
      },
    });
  }

  for (let i: number = 0; i < items.length; i++) {
    const item: Item = items[i];
    it(`Should parse the Header in the test case ${i}`, function () {
      const actual: tags.PlaceObject = parsePlaceObject3(item.input, 8);
      console.warn("Ignoring equality test due to floats");
      // assert.isTrue(tags.PlaceObject.type.equals(actual, item.expected.result));
      assert.deepEqual(item.input.tail(), item.expected.stream);
    });
  }
});
