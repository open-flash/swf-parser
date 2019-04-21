import { ReadableByteStream } from "@open-flash/stream";
import { Incident } from "incident";
import { Uint16, Uint32, Uint8 } from "semantic-types";
import { CompressionMethod, Header, Rect, SwfSignature, Ufixed8P8 } from "swf-tree";
import { createIncompleteStreamError } from "../errors/incomplete-stream";
import { parseRect } from "./basic-data-types";

const UPPER_C: number = "C".charCodeAt(0);
const UPPER_F: number = "F".charCodeAt(0);
const UPPER_S: number = "S".charCodeAt(0);
const UPPER_W: number = "W".charCodeAt(0);
const UPPER_Z: number = "Z".charCodeAt(0);

export function parseSwfSignature(byteStream: ReadableByteStream): SwfSignature {
  if (byteStream.available() < 8) {
    throw createIncompleteStreamError(8);
  }

  const compressionMethod: CompressionMethod = parseCompressionMethod(byteStream);
  const swfVersion: Uint8 = byteStream.readUint8();
  const uncompressedFileLength: Uint32 = byteStream.readUint32LE();

  return {compressionMethod, swfVersion, uncompressedFileLength};
}

// TODO: Move to `movie.ts`
export function parseCompressionMethod(byteStream: ReadableByteStream): CompressionMethod {
  const bytes: Uint8Array = byteStream.takeBytes(3);
  // Read FWS, CWS or ZWS
  if (bytes[1] !== UPPER_W || bytes[2] !== UPPER_S) {
    throw Incident("InvalidCompressionMethod", {bytes}, "Invalid compression method");
  }

  switch (bytes[0]) {
    case UPPER_F:
      return CompressionMethod.None;
    case UPPER_C:
      return CompressionMethod.Deflate;
    case UPPER_Z:
      return CompressionMethod.Lzma;
    default:
      throw Incident("InvalidCompressionMethod", {bytes},  "Invalid compression method");
  }
}

export function parseHeader(byteStream: ReadableByteStream, swfVersion: Uint8): Header {
  const frameSize: Rect = parseRect(byteStream);
  const frameRate: Ufixed8P8 = Ufixed8P8.fromEpsilons(byteStream.readUint16LE());
  const frameCount: Uint16 = byteStream.readUint16LE();
  return {swfVersion, frameSize, frameRate, frameCount};
}
