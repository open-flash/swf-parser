import * as fs from "fs";
import { JsonValueWriter } from "kryo/writers/json-value";
import * as sysPath from "path";
import { Movie } from "swf-tree";
import { $Movie } from "swf-tree/movie";
import { parseMovie } from "../lib/parsers/movie";
import { Stream } from "../lib/stream";

async function main(): Promise<void> {
  if (process.argv.length < 3) {
    console.error("Missing input path");
    return;
  }
  const filePath: string = process.argv[2];
  const absFilePath: string = sysPath.resolve(filePath);
  const data: Buffer = fs.readFileSync(absFilePath);
  const byteStream: Stream = new Stream(data);
  const result: Movie = parseMovie(byteStream);
  console.log(JSON.stringify($Movie.write(new JsonValueWriter(), result), null, 2));
}

main()
  .catch((err: Error): never => {
    console.error(err.stack);
    process.exit(1);
    return undefined as never;
  });
