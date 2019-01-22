import { ReadableStream } from "@open-flash/stream";
import { Incident } from "incident";
import { Uint8, UintSize } from "semantic-types";
import { CompressionMethod, Header, Movie, SwfSignature, Tag } from "swf-tree";
import * as zlib from "zlib";
import { concatBytes } from "../concat-bytes";
import { DefaultParseContext, ParseContext } from "../parse-context";
import { parseHeader, parseSwfSignature } from "./header";
import { parseTagBlockString } from "./tags";

export function parseDecompressedMovie(byteStream: ReadableStream, swfVersion: Uint8): Movie {
  const context: ParseContext = new DefaultParseContext(swfVersion);

  const header: Header = parseHeader(byteStream);
  const tags: Tag[] = parseTagBlockString(byteStream, context);

  // const tags: Tag[] = [];
  // while (byteStream.available() > 0) {
  // A null byte indicates the end-of-tags
  // if (byteStream.peekUint8() === 0) {
  //   byteStream.skip(1);
  //   break;
  // }
  // tags.push(parseTag(byteStream, context));
  // }
  return {header, tags};
}

export function parseMovie(byteStream: ReadableStream): Movie {
  const startPos: UintSize = byteStream.bytePos;
  const headerSignature: SwfSignature = parseSwfSignature(byteStream);
  switch (headerSignature.compressionMethod) {
    case CompressionMethod.None:
      byteStream.bytePos = startPos;
      return parseDecompressedMovie(byteStream, headerSignature.swfVersion);
    case CompressionMethod.Deflate:
      const curPos: UintSize = byteStream.bytePos;
      byteStream.bytePos = startPos;
      const signature: Uint8Array = byteStream.takeBytes(curPos - startPos);
      const tail: Uint8Array = byteStream.tailBytes();
      const tailBuffer: Buffer = Buffer.from(tail as Buffer);
      // TODO: remove cast
      const deflated: Buffer = zlib.inflateSync(tailBuffer);
      const decompressed: Uint8Array = concatBytes([signature, deflated]);
      return parseDecompressedMovie(new ReadableStream(decompressed), headerSignature.swfVersion);
    case CompressionMethod.Lzma:
      throw new Incident("NotImplemented", "Support for LZMA compression is not implemented yet");
    default:
      throw new Incident("UnknownCompressionMethod", "Unknown compression method");
  }
}
