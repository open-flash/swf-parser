import { ReadableStream } from "@open-flash/stream";
import { Incident } from "incident";
import { inflate } from "pako";
import { Uint8 } from "semantic-types";
import { CompressionMethod, Header, Movie, SwfSignature, Tag } from "swf-tree";
import { DefaultParseContext, ParseContext } from "../parse-context";
import { parseHeader, parseSwfSignature } from "./header";
import { parseTagBlockString } from "./tags";

export function parseMovie(byteStream: ReadableStream): Movie {
  const signature: SwfSignature = parseSwfSignature(byteStream);
  switch (signature.compressionMethod) {
    case CompressionMethod.None:
      return parsePayload(byteStream, signature.swfVersion);
    case CompressionMethod.Deflate:
      const tail: Uint8Array = byteStream.tailBytes();
      const payload: Uint8Array = inflate(tail);
      const payloadStream: ReadableStream = new ReadableStream(payload);
      return parsePayload(payloadStream, signature.swfVersion);
    case CompressionMethod.Lzma:
      throw new Incident("NotImplemented", "Support for LZMA compression is not implemented yet");
    default:
      throw new Incident("UnknownCompressionMethod", "Unknown compression method");
  }
}

export function parsePayload(byteStream: ReadableStream, swfVersion: Uint8): Movie {
  const context: ParseContext = new DefaultParseContext(swfVersion);
  const header: Header = parseHeader(byteStream, swfVersion);
  const tags: Tag[] = parseTagBlockString(byteStream, context);
  return {header, tags};
}
