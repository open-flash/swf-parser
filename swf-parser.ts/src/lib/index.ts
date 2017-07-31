import * as ast from "swf-tree";
import {parseMovie} from "./parsers/movie";
import {Stream} from "./stream";

export {ast};

export function parseBuffer(buffer: ArrayBuffer): ast.Movie {
  const byteStream: Stream = new Stream(buffer);
  return parseMovie(byteStream);
}
