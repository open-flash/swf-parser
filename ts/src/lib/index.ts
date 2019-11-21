import { ReadableStream } from "@open-flash/stream";
import * as swf from "swf-types";
import { parseMovie } from "./parsers/movie";

export { swf };

export function movieFromBytes(bytes: Uint8Array): swf.Movie {
  const byteStream: ReadableStream = new ReadableStream(bytes);
  return parseMovie(byteStream);
}
