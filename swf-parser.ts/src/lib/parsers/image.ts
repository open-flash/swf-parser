import { Incident } from "incident";
import { Uint16, Uint32, Uint8, UintSize } from "semantic-types";
import { ByteStream } from "../stream";

export interface ImageDimensions {
  width: number;
  height: number;
}

// SWF and PNG spec (5.2 PNG Signature)
export const PNG_START: Uint8Array = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const GIF_START: Uint8Array = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // "GIF89a"
export const JPEG_START: Uint8Array = new Uint8Array([0xff, 0xd8]); // SOI marker
export const ERRONEOUS_JPEG_START: Uint8Array = new Uint8Array([0xff, 0xd9, 0xff, 0xd8, 0xff, 0xd8]);

/**
 * Reads image properties from a byte stream with the content of a PNG image.
 * It trusts that the image has a valid PNG signature (first 8 bytes).
 *
 * @see https://www.w3.org/TR/PNG/#5Chunk-layout
 * @see https://www.w3.org/TR/PNG/#5ChunkOrdering
 * @see https://www.w3.org/TR/PNG/#11IHDR
 */
export function getPngImageDimensions(byteStream: ByteStream): ImageDimensions {
  // Skip signature (8 bytes) and size of chunk (4 bytes)
  byteStream.skip(12);
  const chunkType: Uint32 = byteStream.readUint32BE();
  const IHDR_CHUNK_TYPE: Uint32 = 0x49484452;
  if (chunkType !== IHDR_CHUNK_TYPE) {
    throw new Incident("InvalidPngFile", {byteStream}, "Expected first chunk to be `IHDR`");
  }
  const width: Uint32 = byteStream.readUint32LE();
  const height: Uint32 = byteStream.readUint32LE();
  return {width, height};
}

// export function readJpeg(byteStream: ByteStream, fixJpeg: boolean): [Uint8Array, ImageProperties] {
//   let height: Uint16 | undefined = undefined;
//   let width: Uint16 | undefined = undefined;
//
//   const JPEG_SOI = new Uint8Array([0xff, 0xd8]);
//   const JPEG_EOI = new Uint8Array([0xff, 0xd9]);
//   const chunks: Uint8Array[] = [];
//   if (fixJpeg) {
//     chunks.push(JPEG_SOI);
//   }
//   for (const chunk of readJpegChunks(byteStream)) {
//     const code: Uint8 = chunk[1];
//     if (fixJpeg) {
//       if (code === 0xd8 || code === 0xd9) { // SOI or EOI
//         continue;
//       }
//     }
//     chunks.push(chunk);
//     if ((code & 0xfc) === 0xc0 && chunk.length >= 9) { // SOF: 0b110000xx
//       const frameHeight: Uint16 = (chunk[5] << 8) + chunk[6];
//       const frameWidth: Uint16 = (chunk[5] << 8) + chunk[6];
//       if (height === undefined) {
//         height = frameHeight;
//       } else if (height !== frameHeight) {
//         // TODO: console.warn or error
//       }
//       if (width === undefined) {
//         width = frameWidth;
//       } else if (width !== frameWidth) {
//         // TODO: console.warn or error
//       }
//       // TODO: Inject JPEG table in first SOF if needed?
//     }
//   }
//   if (fixJpeg) {
//     chunks.push(JPEG_EOI);
//   }
//   if (width === undefined || height === undefined) {
//     throw new Incident("InvalidJpeg", "Frame dimensions not found");
//   }
//   return [concatBytes(chunks), {width, height, hasAlpha: false}];
// }

export function getJpegImageDimensions(byteStream: ByteStream): ImageDimensions {
  let height: Uint16 | undefined = undefined;
  let width: Uint16 | undefined = undefined;

  for (const chunk of readJpegChunks(byteStream)) {
    const code: Uint8 = chunk[1];
    // SOF: 0b110000xx
    if ((code & 0xfc) === 0xc0 && chunk.length >= 9) {
      // TODO: Check why TSLint is confused here
      // tslint:disable-next-line:restrict-plus-operands
      const frameHeight: Uint16 = (chunk[5] << 8) + chunk[6];
      // tslint:disable-next-line:restrict-plus-operands
      const frameWidth: Uint16 = (chunk[7] << 8) + chunk[8];
      if (height === undefined || width === undefined) {
        height = frameHeight;
        width = frameWidth;
      } else if (height !== frameHeight || width !== frameWidth) {
        // TODO: console.warn or error
      }
    }
  }
  if (width === undefined || height === undefined) {
    throw new Incident("InvalidJpeg", "Frame dimensions not found");
  }
  return {width, height};
}

/**
 * Returns the JPEG chunks: assumes all the chunks are complete.
 */
function* readJpegChunks(byteStream: ByteStream): Iterable<Uint8Array> {
  const bytes: Uint8Array = byteStream.takeBytes(byteStream.available());
  let i: UintSize = 0;
  const byteCount: UintSize = bytes.length;

  function getNextChunkIndex(search: UintSize): UintSize | undefined {
    // A chunk marker starts with `0xff` followed by any byte except:
    // - `0x00` (ff 00 is escaped ff)
    // - `0xff` (padding)
    while ((search + 1) < byteCount) {
      if (bytes[search] === 0xff && (bytes[search + 1] !== 0x00 && bytes[search + 1] !== 0xff)) {
        return search;
      } else {
        search++;
      }
    }
    return undefined;
  }

  let chunkStart: number | undefined = getNextChunkIndex(i);
  while (chunkStart !== undefined) {
    const code: Uint8 = bytes[chunkStart + 1];
    i += 2;
    // Check if this chunk has a `size` field
    if (
      (code >= 0xc0 && code <= 0xc7)
      || (code >= 0xc9 && code <= 0xcf)
      || (code >= 0xda && code <= 0xef)
      || code === 0xfe
    ) {
      // Advance by `size` (stored as an Uint16LE)
      i += (bytes[chunkStart + 2] << 8) + bytes[chunkStart + 3];
    }
    const nextChunkStart: number | undefined = getNextChunkIndex(i);
    yield bytes.subarray(chunkStart, nextChunkStart);
    chunkStart = nextChunkStart;
  }
}

export function getGifImageDimensions(byteStream: ByteStream): ImageDimensions {
  byteStream.skip(6); // GIF header: "GIF89a" in ASCII for SWF
  const width: Uint16 = byteStream.readUint16BE();
  const height: Uint16 = byteStream.readUint16BE();
  return {width, height};
}

/**
 * Returns a boolean indicating if `imageData` starts with `startBytes`
 */
export function testImageStart(imageData: Uint8Array, startBytes: Uint8Array): boolean {
  if (imageData.length < startBytes.length) {
    return false;
  }
  for (let i: number = 0; i < startBytes.length; i++) {
    if (imageData[i] !== startBytes[i]) {
      return false;
    }
  }
  return true;
}
