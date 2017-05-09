import {Incident} from "incident";
import * as zlib from "zlib";
import {SwfFile} from "../ast/swf-file";
import {SwfHeader} from "../ast/swf-header";
import {SwfTag} from "../ast/swf-tag";
import {Stream} from "../stream";
import {parseSwfHeader, parseSwfSignature} from "./header";
import {parseSwfTag} from "./swf-tags";
import {SwfTagType} from "../ast/swf-tag-type";
import {SwfSignature} from "../ast/swf-signature";
import {CompressionMethod} from "../ast/compression-method";

export function parseDecompressedSwfFile(byteStream: Stream): SwfFile {
  const header: SwfHeader = parseSwfHeader(byteStream);
  const tags: SwfTag[] = [];
  let cur: SwfTag;
  do {
    cur = parseSwfTag(byteStream);
    tags.push(cur);
  } while (cur.type !== SwfTagType.End);
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
