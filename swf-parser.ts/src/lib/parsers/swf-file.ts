import {Incident} from "incident";
import {CompressionMethod, Header, SwfFile, SwfSignature, Tag, TagType} from "swf-tree";
import * as zlib from "zlib";
import {Stream} from "../stream";
import {parseSwfHeader, parseSwfSignature} from "./header";
import {parseSwfTag} from "./swf-tags";

export function parseDecompressedSwfFile(byteStream: Stream): SwfFile {
  const header: Header = parseSwfHeader(byteStream);
  const tags: Tag[] = [];
  while (byteStream.available() > 0) {
    // A null byte indicates the end the string of actions
    if (byteStream.peekUint8() === 0) {
      byteStream.skip(1);
      break;
    }
    tags.push(parseSwfTag(byteStream));
  }
  return {header, tags};
}

export async function parseSwfFile(byteStream: Stream): Promise<SwfFile> {
  const startPos: number = byteStream.bytePos;
  const headerSignature: SwfSignature = parseSwfSignature(byteStream);
  switch (headerSignature.compressionMethod) {
    case CompressionMethod.None:
      byteStream.bytePos = startPos;
      return parseDecompressedSwfFile(byteStream);
    case CompressionMethod.Deflate:
      const signature: Buffer = byteStream.substream(0, 8).toBuffer();
      const tail: Buffer = byteStream.tail().toBuffer();
      const deflated: Buffer = zlib.inflateSync(tail);
      const decompressed: Buffer = Buffer.concat([signature, deflated]);
      return parseDecompressedSwfFile(new Stream(decompressed));
    case CompressionMethod.Lzma:
      throw new Incident("NotImplemented", "Support for LZMA compression is not implemented yet");
    default:
      throw new Incident("UnknownCompressionMethod", "Unknown compression method");
  }
}
