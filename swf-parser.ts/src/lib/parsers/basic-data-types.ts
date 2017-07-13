import {Rect, SRgb} from "swf-tree";
import {Int16, UintSize} from "../integer-names";
import {Stream} from "../stream";

export function parseRect(byteStream: Stream): Rect {
  const result: Rect = parseRectBits(byteStream);
  byteStream.align();
  return result;
}

export function parseRectBits(bitStream: Stream): Rect {
  const nBits: UintSize = bitStream.readUint16Bits(5);
  const xMin: Int16 = bitStream.readInt16Bits(nBits);
  const xMax: Int16 = bitStream.readInt16Bits(nBits);
  const yMin: Int16 = bitStream.readInt16Bits(nBits);
  const yMax: Int16 = bitStream.readInt16Bits(nBits);
  return {xMin, xMax, yMin, yMax};
}

export function parseRgb(byteStream: Stream): SRgb {
  return {
    r: byteStream.readUint8(),
    g: byteStream.readUint8(),
    b: byteStream.readUint8(),
  };
}
