import chai from "chai";
import { JsonReader } from "kryo/readers/json";
import { JsonValueWriter } from "kryo/writers/json-value";
import sysPath from "path";
import { $Movie, Movie } from "swf-tree/movie";
import { movieFromBytes } from "../lib";
import meta from "./meta.js";
import { readFile, readTextFile, writeTextFile } from "./utils";

const PROJECT_ROOT: string = sysPath.join(meta.dirname, "..", "..", "..");
const MOVIE_SAMPLES_ROOT: string = sysPath.join(PROJECT_ROOT, "..", "tests", "movies");

const JSON_READER: JsonReader = new JsonReader();
const JSON_VALUE_WRITER: JsonValueWriter = new JsonValueWriter();

describe("movieFromBytes", function () {
  this.timeout(300000); // The timeout is this high due to CI being extremely slow

  for (const sample of getSamples()) {
    it(sample.name, async function () {
      const inputBytes: Buffer = await readFile(sysPath.join(MOVIE_SAMPLES_ROOT, sample.name, "main.swf"));
      const actualMovie: Movie = movieFromBytes(inputBytes);
      const testErr: Error | undefined = $Movie.testError!(actualMovie);
      try {
        chai.assert.isUndefined(testErr, "InvalidMovie");
      } catch (err) {
        console.error(testErr!.toString());
        throw err;
      }
      const actualJson: string = JSON.stringify($Movie.write(JSON_VALUE_WRITER, actualMovie), null, 2);
      await writeTextFile(sysPath.join(MOVIE_SAMPLES_ROOT, sample.name, "local-ast.ts.json"), `${actualJson}\n`);
      const expectedJson: string = await readTextFile(sysPath.join(MOVIE_SAMPLES_ROOT, sample.name, "ast.json"));
      const expectedMovie: Movie = $Movie.read(JSON_READER, expectedJson);
      try {
        chai.assert.isTrue($Movie.equals(actualMovie, expectedMovie));
      } catch (err) {
        chai.assert.strictEqual(
          actualJson,
          JSON.stringify($Movie.write(JSON_VALUE_WRITER, expectedMovie), null, 2),
        );
        throw err;
      }
    });
  }
});

interface Sample {
  name: string;
}

function* getSamples(): IterableIterator<Sample> {
  yield {name: "blank"};
  yield {name: "hello-world"};
  yield {name: "morph-rotating-square"};
  yield {name: "squares"};
}
