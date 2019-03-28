import chai from "chai";
import fs from "fs";
import { JsonReader } from "kryo/readers/json";
import { JsonValueWriter } from "kryo/writers/json-value";
import sysPath from "path";
import { $Movie, Movie } from "swf-tree/movie";
import { movieFromBytes } from "../lib";
import meta from "./meta.js";

const PROJECT_ROOT: string = sysPath.join(meta.dirname, "..", "..", "..");
const TEST_SAMPLES_ROOT: string = sysPath.join(PROJECT_ROOT, "..", "tests", "open-flash-db", "standalone-movies");

const JSON_READER: JsonReader = new JsonReader();
const JSON_VALUE_WRITER: JsonValueWriter = new JsonValueWriter();

describe.only("movieFromBytes", function () {
  this.timeout(10000);

  for (const sample of getSamples()) {
    it(sample.name, async function () {
      const inputBytes: Buffer = await readFile(sysPath.join(TEST_SAMPLES_ROOT, sample.name, "main.swf"));
      const actualMovie: Movie = movieFromBytes(inputBytes);
      const testErr: Error | undefined = $Movie.testError!(actualMovie);
      try {
        chai.assert.isUndefined(testErr, "InvalidMovie");
      } catch (err) {
        console.error(testErr!.toString());
        throw err;
      }
      const actualJson: string = JSON.stringify($Movie.write(JSON_VALUE_WRITER, actualMovie), null, 2);
      await writeTextFile(sysPath.join(TEST_SAMPLES_ROOT, sample.name, "tmp-ast.ts.json"), `${actualJson}\n`);
      const expectedJson: string = await readTextFile(sysPath.join(TEST_SAMPLES_ROOT, sample.name, "ast.json"));
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

async function readTextFile(filePath: fs.PathLike): Promise<string> {
  return new Promise<string>((resolve, reject): void => {
    fs.readFile(filePath, {encoding: "UTF-8"}, (err: NodeJS.ErrnoException | null, data: string): void => {
      if (err !== null) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

async function readFile(filePath: fs.PathLike): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject): void => {
    fs.readFile(filePath, {encoding: null}, (err: NodeJS.ErrnoException | null, data: Buffer): void => {
      if (err !== null) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

async function writeTextFile(filePath: fs.PathLike, text: string): Promise<void> {
  return new Promise<void>((resolve, reject): void => {
    fs.writeFile(filePath, text, (err: NodeJS.ErrnoException | null): void => {
      if (err !== null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

interface Sample {
  name: string;
}

function* getSamples(): IterableIterator<Sample> {
  yield {name: "blank"};
  yield {name: "hello-world"};
  yield {name: "homestuck-02791"};
  // yield {name: "homestuck-beta-1"};
  yield {name: "morph-rotating-square"};
  yield {name: "squares"};
}
