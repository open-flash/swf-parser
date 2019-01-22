import { ReadableStream } from "@open-flash/stream";
import * as ast from "swf-tree";
import { parseMovie } from "./parsers/movie";

export { ast };

export function movieFromBytes(bytes: Uint8Array): ast.Movie {
  const byteStream: ReadableStream = new ReadableStream(bytes);
  return parseMovie(byteStream);
}
