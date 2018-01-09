import { Incident } from "incident";
import { CompressionMethod, Header, Movie, SwfSignature, Tag } from "swf-tree";
import * as zlib from "zlib";
import { DefaultParseContext, ParseContext } from "../parse-context";
import { Stream } from "../stream";
import { parseHeader, parseSwfSignature } from "./header";
import { parseTag } from "./tags";

export function parseDecompressedMovie(byteStream: Stream): Movie {
  // TODO(demurgos): take parse context or version as an argument
  const context: ParseContext = new DefaultParseContext(0);

  const header: Header = parseHeader(byteStream);
  const tags: Tag[] = [];
  while (byteStream.available() > 0) {
    // A null byte indicates the end-of-tags
    if (byteStream.peekUint8() === 0) {
      byteStream.skip(1);
      break;
    }
    tags.push(parseTag(byteStream, context));
  }
  return {header, tags};
}

export function parseMovie(byteStream: Stream): Movie {
  const startPos: number = byteStream.bytePos;
  const headerSignature: SwfSignature = parseSwfSignature(byteStream);
  switch (headerSignature.compressionMethod) {
    case CompressionMethod.None:
      byteStream.bytePos = startPos;
      return parseDecompressedMovie(byteStream);
    case CompressionMethod.Deflate:
      const signature: Buffer = byteStream.substream(0, 8).toBuffer();
      const tail: Buffer = byteStream.tail().toBuffer();
      const deflated: Buffer = zlib.inflateSync(tail);
      const decompressed: Buffer = Buffer.concat([signature, deflated]);
      return parseDecompressedMovie(new Stream(decompressed));
    case CompressionMethod.Lzma:
      throw new Incident("NotImplemented", "Support for LZMA compression is not implemented yet");
    default:
      throw new Incident("UnknownCompressionMethod", "Unknown compression method");
  }
}
