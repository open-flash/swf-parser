import stream from "@open-flash/stream";
import { Uint8 } from "semantic-types";
import * as swf from "swf-types";
import { parseSwf as parseSwfStream } from "./parsers/movie.js";
import { parseTag as parseTagStream } from "./parsers/tags.js";

export { swf };

/**
 * Parses a completely loaded SWF file.
 *
 * @param bytes SWF file to parse
 * @returns The parsed Movie
 */
export function parseSwf(bytes: Uint8Array): swf.Movie {
  const byteStream: stream.ReadableStream = new stream.ReadableStream(bytes);
  return parseSwfStream(byteStream);
}

/**
 * Parses the tag at the start of `input`.
 *
 * This parser assumes that `input` is complete: it has all the data until the end of the movie.
 *
 * @param bytes Tag to parse
 * @param swfVersion SWF version to use for tags depending on the SWF version
 * @returns The parsed tag, or `undefined` if an error occurred.
 */
export function parseTag(bytes: Uint8Array, swfVersion: Uint8): swf.Tag | undefined {
  const byteStream: stream.ReadableStream = new stream.ReadableStream(bytes);
  return parseTagStream(byteStream, swfVersion);
}
