import * as fs from "fs";
import * as sysPath from "path";
import {Stream} from "../lib/stream";
import {SwfFile} from "../lib/ast/swf-file";
import {parseSwfFile} from "../lib/parsers/swf-file";

async function main(): Promise<void> {
  if (process.argv.length < 3) {
    console.error("Missing input path");
    return;
  }
  const filePath: string = process.argv[2];
  const absFilePath: string = sysPath.resolve(filePath);
  const data: Buffer = fs.readFileSync(absFilePath);
  const byteStream: Stream = new Stream(data);
  const result: SwfFile = await parseSwfFile(byteStream);
  console.log(JSON.stringify(SwfFile.type.write("json", result), null, 2));
}

main()
  .catch((err: Error): never => {
    console.error(err.stack);
    process.exit(1);
    return undefined as never;
  });
