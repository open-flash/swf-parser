import { Uint2, Uint4, Uint8 } from "semantic-types";
import {
  ColorSpace, ColorStop, Gradient, GradientSpread, MorphColorStop, MorphGradient,
  StraightSRgba8,
} from "swf-tree";
import { ByteStream } from "../stream";
import { parseSRgb8, parseStraightSRgba8 } from "./basic-data-types";

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
  const spreadId: Uint2 = <Uint2> ((flags & ((1 << 8) - 1)) >>> 6);
  const colorSpaceId: Uint2 = <Uint2> ((flags & ((1 << 6) - 1)) >>> 4);
  const colorCount: Uint4 = <Uint4> (flags & ((1 << 4) - 1));
  let spread: GradientSpread;
  switch (spreadId) {
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
  switch (colorSpaceId) {
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

export function parseMorphColorStop(byteStream: ByteStream, withAlpha: boolean): MorphColorStop {
  const {ratio: startRatio, color: startColor} = parseColorStop(byteStream, withAlpha);
  const {ratio: endRatio, color: endColor} = parseColorStop(byteStream, withAlpha);
  return {startRatio, startColor, endRatio, endColor};
}

export function parseMorphGradient(byteStream: ByteStream, withAlpha: boolean): MorphGradient {
  const flags: Uint8 = byteStream.readUint8();
  const spreadId: Uint2 = <Uint2> ((flags & ((1 << 8) - 1)) >>> 6);
  const colorSpaceId: Uint2 = <Uint2> ((flags & ((1 << 6) - 1)) >>> 4);
  const colorCount: Uint4 = <Uint4> (flags & ((1 << 4) - 1));
  let spread: GradientSpread;
  switch (spreadId) {
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
  switch (colorSpaceId) {
    case 0:
      colorSpace = ColorSpace.SRgb;
      break;
    case 1:
      colorSpace = ColorSpace.LinearRgb;
      break;
    default:
      throw new Error("Unexpected gradient spread");
  }
  const colors: MorphColorStop[] = [];
  for (let i: number = 0; i < colorCount; i++) {
    colors.push(parseMorphColorStop(byteStream, withAlpha));
  }
  return {
    spread,
    colorSpace,
    colors,
  };
}
