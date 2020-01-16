import { ReadableStream } from "@open-flash/stream";
import { Incident } from "incident";
import { inflate } from "pako";
import { Uint8 } from "semantic-types";
import { CompressionMethod, Header, Movie, SwfSignature, Tag } from "swf-types";
import { parseHeader, parseSwfSignature } from "./header";
import { parseTagBlockString } from "./tags";

/**
 * Parses a completely loaded SWF file.
 *
 * @param byteStream SWF stream to parse
 */
export function parseSwf(byteStream: ReadableStream): Movie {
  const signature: SwfSignature = parseSwfSignature(byteStream);
  switch (signature.compressionMethod) {
    case CompressionMethod.None:
      return parseMovie(byteStream, signature.swfVersion);
    case CompressionMethod.Deflate:
      const tail: Uint8Array = byteStream.tailBytes();
      const payload: Uint8Array = inflate(tail);
      const payloadStream: ReadableStream = new ReadableStream(payload);
      return parseMovie(payloadStream, signature.swfVersion);
    case CompressionMethod.Lzma:
      throw new Incident("NotImplemented", "Support for LZMA compression is not implemented yet");
    default:
      throw new Incident("UnknownCompressionMethod", "Unknown compression method");
  }
}

/**
 * Parses a completely loaded movie.
 *
 * The movie is the uncompressed payload of the SWF.
 *
 * @param byteStream Movie bytestream
 * @param swfVersion Parsed movie.
 */
export function parseMovie(byteStream: ReadableStream, swfVersion: Uint8): Movie {
  const header: Header = parseHeader(byteStream, swfVersion);
  const tags: Tag[] = parseTagBlockString(byteStream, swfVersion);
  return {header, tags};
}
