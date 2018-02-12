import * as ast from "swf-tree";
import { parseMovie } from "./parsers/movie";
import { Stream } from "./stream";

export { ast };

export function parseBytes(bytes: Uint8Array): ast.Movie {
  const byteStream: Stream = new Stream(bytes);
  return parseMovie(byteStream);
}
