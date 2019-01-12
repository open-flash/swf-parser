import { Sint16, UintSize } from "semantic-types";
import {
  ColorTransform,
  ColorTransformWithAlpha,
  Matrix,
  Rect,
  Sfixed16P16,
  Sfixed8P8,
  SRgb8,
  StraightSRgba8,
} from "swf-tree";
import { BitStream, ByteStream } from "../stream";

export function parseRect(byteStream: ByteStream): Rect {
  const bitStream: BitStream = byteStream.asBitStream();
  const result: Rect = parseRectBits(bitStream);
  bitStream.align();
  return result;
}

export function parseRectBits(bitStream: BitStream): Rect {
  const nBits: UintSize = bitStream.readUint16Bits(5);
  const xMin: Sint16 = bitStream.readSint16Bits(nBits);
  const xMax: Sint16 = bitStream.readSint16Bits(nBits);
  const yMin: Sint16 = bitStream.readSint16Bits(nBits);
  const yMax: Sint16 = bitStream.readSint16Bits(nBits);
  return {xMin, xMax, yMin, yMax};
}

export function parseSRgb8(byteStream: ByteStream): SRgb8 {
  return {
    r: byteStream.readUint8(),
    g: byteStream.readUint8(),
    b: byteStream.readUint8(),
  };
}

export function parseStraightSRgba8(byteStream: ByteStream): StraightSRgba8 {
  return {
    r: byteStream.readUint8(),
    g: byteStream.readUint8(),
    b: byteStream.readUint8(),
    a: byteStream.readUint8(),
  };
}

export function parseMatrix(byteStream: ByteStream): Matrix {
  const bitStream: BitStream = byteStream.asBitStream();
  const result: Matrix = parseMatrixBits(bitStream);
  bitStream.align();
  return result;
}

export function parseMatrixBits(bitStream: BitStream): Matrix {
  const hasScale: boolean = bitStream.readBoolBits();
  let scaleX: Sfixed16P16;
  let scaleY: Sfixed16P16;
  if (hasScale) {
    const scaleBits: UintSize = bitStream.readUint16Bits(5);
    scaleX = bitStream.readSfixed16P16Bits(scaleBits);
    scaleY = bitStream.readSfixed16P16Bits(scaleBits);
  } else {
    scaleX = Sfixed16P16.fromValue(1);
    scaleY = Sfixed16P16.fromValue(1);
  }
  const hasSkew: boolean = bitStream.readBoolBits();
  let skew0: Sfixed16P16;
  let skew1: Sfixed16P16;
  if (hasSkew) {
    const skewBits: UintSize = bitStream.readUint16Bits(5);
    skew0 = bitStream.readSfixed16P16Bits(skewBits);
    skew1 = bitStream.readSfixed16P16Bits(skewBits);
  } else {
    skew0 = Sfixed16P16.fromValue(0);
    skew1 = Sfixed16P16.fromValue(0);
  }
  const translateBits: UintSize = bitStream.readUint16Bits(5);
  const translateX: Sint16 = bitStream.readSint16Bits(translateBits);
  const translateY: Sint16 = bitStream.readSint16Bits(translateBits);

  return {
    scaleX,
    scaleY,
    rotateSkew0: skew0,
    rotateSkew1: skew1,
    translateX,
    translateY,
  };
}

export function parseColorTransform(byteStream: ByteStream): ColorTransform {
  const bitStream: BitStream = byteStream.asBitStream();
  const result: ColorTransform = parseColorTransformBits(bitStream);
  bitStream.align();
  return result;
}

export function parseColorTransformBits(bitStream: BitStream): ColorTransform {
  const hasAdd: boolean = bitStream.readBoolBits();
  const hasMult: boolean = bitStream.readBoolBits();
  const nBits: UintSize = bitStream.readUint16Bits(4);

  let redMult: Sfixed8P8;
  let greenMult: Sfixed8P8;
  let blueMult: Sfixed8P8;
  if (hasMult) {
    redMult = Sfixed8P8.fromEpsilons(bitStream.readSint16Bits(nBits));
    greenMult = Sfixed8P8.fromEpsilons(bitStream.readSint16Bits(nBits));
    blueMult = Sfixed8P8.fromEpsilons(bitStream.readSint16Bits(nBits));
  } else {
    redMult = Sfixed8P8.fromValue(1);
    greenMult = Sfixed8P8.fromValue(1);
    blueMult = Sfixed8P8.fromValue(1);
  }

  let redAdd: Sint16;
  let greenAdd: Sint16;
  let blueAdd: Sint16;
  if (hasAdd) {
    redAdd = bitStream.readSint16Bits(nBits);
    greenAdd = bitStream.readSint16Bits(nBits);
    blueAdd = bitStream.readSint16Bits(nBits);
  } else {
    redAdd = 0;
    greenAdd = 0;
    blueAdd = 0;
  }

  return {
    redMult,
    greenMult,
    blueMult,
    redAdd,
    greenAdd,
    blueAdd,
  };
}

export function parseColorTransformWithAlpha(byteStream: ByteStream): ColorTransformWithAlpha {
  const bitStream: BitStream = byteStream.asBitStream();
  const result: ColorTransformWithAlpha = parseColorTransformWithAlphaBits(bitStream);
  bitStream.align();
  return result;
}

export function parseColorTransformWithAlphaBits(bitStream: BitStream): ColorTransformWithAlpha {
  const hasAdd: boolean = bitStream.readBoolBits();
  const hasMult: boolean = bitStream.readBoolBits();
  const nBits: UintSize = bitStream.readUint16Bits(4);

  let redMult: Sfixed8P8;
  let greenMult: Sfixed8P8;
  let blueMult: Sfixed8P8;
  let alphaMult: Sfixed8P8;
  if (hasMult) {
    redMult = Sfixed8P8.fromEpsilons(bitStream.readSint16Bits(nBits));
    greenMult = Sfixed8P8.fromEpsilons(bitStream.readSint16Bits(nBits));
    blueMult = Sfixed8P8.fromEpsilons(bitStream.readSint16Bits(nBits));
    alphaMult = Sfixed8P8.fromEpsilons(bitStream.readSint16Bits(nBits));
  } else {
    redMult = Sfixed8P8.fromValue(1);
    greenMult = Sfixed8P8.fromValue(1);
    blueMult = Sfixed8P8.fromValue(1);
    alphaMult = Sfixed8P8.fromValue(1);
  }

  let redAdd: Sint16;
  let greenAdd: Sint16;
  let blueAdd: Sint16;
  let alphaAdd: Sint16;
  if (hasAdd) {
    redAdd = bitStream.readSint16Bits(nBits);
    greenAdd = bitStream.readSint16Bits(nBits);
    blueAdd = bitStream.readSint16Bits(nBits);
    alphaAdd = bitStream.readSint16Bits(nBits);
  } else {
    redAdd = 0;
    greenAdd = 0;
    blueAdd = 0;
    alphaAdd = 0;
  }

  return {
    redMult,
    greenMult,
    blueMult,
    alphaMult,
    redAdd,
    greenAdd,
    blueAdd,
    alphaAdd,
  };
}
