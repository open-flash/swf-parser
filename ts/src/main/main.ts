import * as fs from "fs";
import { JsonValueWriter } from "kryo/writers/json-value";
import * as sysPath from "path";
import { $Movie, Movie } from "swf-types/movie";
import { movieFromBytes } from "../lib";

async function main(): Promise<void> {
  if (process.argv.length < 3) {
    console.error("Missing input path");
    return;
  }
  const filePath: string = process.argv[2];
  const absFilePath: string = sysPath.resolve(filePath);
  const bytes: Uint8Array = fs.readFileSync(absFilePath);
  const movie: Movie = movieFromBytes(bytes);
  console.log(JSON.stringify($Movie.write(new JsonValueWriter(), movie), null, 2));
}

main()
  .catch((err: Error): never => {
    console.error(err.stack);
    process.exit(1);
    return undefined as never;
  });
