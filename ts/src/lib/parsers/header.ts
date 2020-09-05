import { ReadableByteStream } from "@open-flash/stream";
import incident from "incident";
import { Uint8,Uint16, Uint32 } from "semantic-types";
import { CompressionMethod } from "swf-types/lib/compression-method.js";
import { Ufixed8P8 } from "swf-types/lib/fixed-point/ufixed8p8.js";
import { Header } from "swf-types/lib/header.js";
import { Rect } from "swf-types/lib/rect.js";
import { SwfSignature } from "swf-types/lib/swf-signature.js";

import { createIncompleteStreamError } from "../errors/incomplete-stream.js";
import { parseRect } from "./basic-data-types.js";

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
    throw incident.Incident("InvalidCompressionMethod", {bytes}, "Invalid compression method");
  }

  switch (bytes[0]) {
    case UPPER_F:
      return CompressionMethod.None;
    case UPPER_C:
      return CompressionMethod.Deflate;
    case UPPER_Z:
      return CompressionMethod.Lzma;
    default:
      throw incident.Incident("InvalidCompressionMethod", {bytes},  "Invalid compression method");
  }
}

export function parseHeader(byteStream: ReadableByteStream, swfVersion: Uint8): Header {
  const frameSize: Rect = parseRect(byteStream);
  const frameRate: Ufixed8P8 = Ufixed8P8.fromEpsilons(byteStream.readUint16LE());
  const frameCount: Uint16 = byteStream.readUint16LE();
  return {swfVersion, frameSize, frameRate, frameCount};
}
