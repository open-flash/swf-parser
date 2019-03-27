import { ReadableStream } from "@open-flash/stream";
import { Incident } from "incident";
import { Uint16, Uint32, Uint8 } from "semantic-types";
import { CompressionMethod, Header, Rect, SwfSignature, Ufixed8P8 } from "swf-tree";
import { createIncompleteStreamError } from "../errors/incomplete-stream";
import { parseRect } from "./basic-data-types";

// TODO: Move to `movie.ts`
export function parseCompressionMethod(byteStream: ReadableStream): CompressionMethod {
  if (byteStream.byteEnd < 3) {
    throw createIncompleteStreamError(3);
  }
  // Read FWS, CWS or ZWS
  if (
    byteStream.bytes[byteStream.bytePos + 1] !== "W".charCodeAt(0)
    || byteStream.bytes[byteStream.bytePos + 2] !== "S".charCodeAt(0)
  ) {
    throw Incident("InvalidCompressionMethod", "Invalid compression method");
  }

  let result: CompressionMethod;
  switch (byteStream.bytes[byteStream.bytePos]) {
    case "F".charCodeAt(0):
      result = CompressionMethod.None;
      break;
    case "C".charCodeAt(0):
      result = CompressionMethod.Deflate;
      break;
    case "Z".charCodeAt(0):
      result = CompressionMethod.Lzma;
      break;
    default:
      throw Incident("InvalidCompressionMethod", "Invalid compression method");
  }
  byteStream.bytePos += 3;
  return result;
}

export function parseSwfSignature(byteStream: ReadableStream): SwfSignature {
  if (byteStream.byteEnd < 8) {
    throw createIncompleteStreamError(8);
  }

  const compressionMethod: CompressionMethod = parseCompressionMethod(byteStream);
  const swfVersion: Uint8 = byteStream.readUint8();
  const uncompressedFileLength: Uint32 = byteStream.readUint32LE();

  return {compressionMethod, swfVersion, uncompressedFileLength};
}

export function parseHeader(byteStream: ReadableStream): Header {
  const signature: SwfSignature = parseSwfSignature(byteStream);
  const frameSize: Rect = parseRect(byteStream);
  const frameRate: Ufixed8P8 = Ufixed8P8.fromEpsilons(byteStream.readUint16LE());
  const frameCount: Uint16 = byteStream.readUint16LE();
  return {swfVersion: signature.swfVersion, frameSize, frameRate, frameCount};
}
