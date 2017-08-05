import {Uint2, Uint4, Uint8} from "semantic-types";
import {ColorSpace, ColorStop, Gradient, GradientSpread, StraightSRgba8} from "swf-tree";
import {ByteStream} from "../stream";
import {parseSRgb8, parseStraightSRgba8} from "./basic-data-types";

export function parseColorStop(byteStream: ByteStream, withAlpha: boolean): ColorStop {
  const ratio: Uint8 = byteStream.readUint8();
  let color: StraightSRgba8;
  if (withAlpha) {
    color = parseStraightSRgba8(byteStream);
  } else {
    color = {...parseSRgb8(byteStream), a: 255};
  }
  return {ratio, color};
}

export function parseGradient(byteStream: ByteStream, withAlpha: boolean): Gradient {
  const flags: Uint8 = byteStream.readUint8();
  const spreadBits: Uint2 = <Uint2> (flags & ((1 << 8) - 1) >>> 6);
  const colorSpaceBits: Uint2 = <Uint2> (flags & ((1 << 6) - 1) >>> 4);
  const colorCount: Uint4 = <Uint4> (flags & ((1 << 4) - 1));
  let spread: GradientSpread;
  switch (spreadBits) {
    case 0:
      spread = GradientSpread.Pad;
      break;
    case 1:
      spread = GradientSpread.Reflect;
      break;
    case 2:
      spread = GradientSpread.Repeat;
      break;
    default:
      throw new Error("Unexpected gradient spread");
  }
  let colorSpace: ColorSpace;
  switch (colorSpaceBits) {
    case 0:
      colorSpace = ColorSpace.SRgb;
      break;
    case 1:
      colorSpace = ColorSpace.LinearRgb;
      break;
    default:
      throw new Error("Unexpected gradient spread");
  }
  const colors: ColorStop[] = [];
  for (let i: number = 0; i < colorCount; i++) {
    colors.push(parseColorStop(byteStream, withAlpha));
  }
  return {
    spread,
    colorSpace,
    colors,
  };
}
