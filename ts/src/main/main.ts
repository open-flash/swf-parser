import * as fs from "fs";
import { JSON_VALUE_WRITER } from "kryo-json/json-value-writer";
import * as sysPath from "path";
import { $Movie, Movie } from "swf-types/movie";

import { parseSwf } from "../lib/index.js";

async function main(): Promise<void> {
  if (process.argv.length < 3) {
    console.error("Missing input path");
    return;
  }
  const filePath: string = process.argv[2];
  const absFilePath: string = sysPath.resolve(filePath);
  const bytes: Uint8Array = fs.readFileSync(absFilePath);
  const movie: Movie = parseSwf(bytes);
  console.log(JSON.stringify($Movie.write(JSON_VALUE_WRITER, movie), null, 2));
}

main()
  .catch((err: Error): never => {
    console.error(err.stack);
    process.exit(1);
  });
