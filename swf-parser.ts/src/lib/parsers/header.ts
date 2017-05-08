import {Incident} from "incident";
import {CompressionMethod} from "../ast/compression-method";
import {Rect} from "../ast/rect";
import {SwfHeader} from "../ast/swf-header";
import {SwfSignature} from "../ast/swf-signature";
import {IncompleteStreamError} from "../errors/incomplete-stream";
import {Ufixed8P8} from "../fixed-point/ufixed8p8";
import {Uint16, Uint32, Uint8} from "../integer-names";
import {Stream} from "../stream";
import {parseRect} from "./basic-data-types";

export function parseCompressionMethod(byteStream: Stream): CompressionMethod {
  if (byteStream.byteEnd < 3) {
    throw IncompleteStreamError.create(3);
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

export function parseSwfSignature(byteStream: Stream): SwfSignature {
  if (byteStream.byteEnd < 8) {
    throw IncompleteStreamError.create(8);
  }

  const compressionMethod: CompressionMethod = parseCompressionMethod(byteStream);
  const swfVersion: Uint8 = byteStream.readUint8LE();
  const uncompressedFileLength: Uint32 = byteStream.readUint32LE();

  return {compressionMethod, swfVersion, uncompressedFileLength};
}

export function parseSwfHeader(byteStream: Stream): SwfHeader {
  const signature: SwfSignature = parseSwfSignature(byteStream);
  const frameSize: Rect = parseRect(byteStream);
  const frameRate: Ufixed8P8 = byteStream.readUfixed8P8LE();
  const frameCount: Uint16 = byteStream.readUint16LE();
  return {...signature, frameSize, frameRate, frameCount};
}
