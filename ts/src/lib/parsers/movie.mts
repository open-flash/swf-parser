import { ReadableStream } from "@open-flash/stream";
import incident from "incident";
import pako from "pako";
import { Uint8 } from "semantic-types";
import { CompressionMethod } from "swf-types/compression-method";
import { Header } from "swf-types/header";
import { Movie } from "swf-types/movie";
import { SwfSignature } from "swf-types/swf-signature";
import { Tag } from "swf-types/tag";

import { parseHeader, parseSwfSignature } from "./header.mjs";
import { parseTagBlockString } from "./tags.mjs";

/**
 * Parses a completely loaded SWF file.
 *
 * @param byteStream SWF stream to parse
 */
export function parseSwf(byteStream: ReadableStream): Movie {
  const signature: SwfSignature = parseSwfSignature(byteStream);
  switch (signature.compressionMethod) {
    case CompressionMethod.None: {
      return parseMovie(byteStream, signature.swfVersion);
    }
    case CompressionMethod.Deflate: {
      const tail: Uint8Array = byteStream.tailBytes();
      const payload: Uint8Array = pako.inflate(tail);
      const payloadStream: ReadableStream = new ReadableStream(payload);
      return parseMovie(payloadStream, signature.swfVersion);
    }
    case CompressionMethod.Lzma: {
      throw new incident.Incident("NotImplemented", "Support for LZMA compression is not implemented yet");
    }
    default: {
      throw new incident.Incident("UnknownCompressionMethod", "Unknown compression method");
    }
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
