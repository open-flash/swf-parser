import { ReadableBitStream, ReadableByteStream } from "@open-flash/stream";
import incident from "incident";
import { Sint32, Uint2, Uint5, Uint16, UintSize } from "semantic-types";
import { CapStyle } from "swf-types/cap-style";
import { FillStyleType } from "swf-types/fill-styles/_type";
import * as fillStyles from "swf-types/fill-styles/index";
import { Sfixed8P8 } from "swf-types/fixed-point/sfixed8p8";
import { JoinStyle } from "swf-types/join-style";
import { JoinStyleType } from "swf-types/join-styles/_type";
import { Matrix } from "swf-types/matrix";
import { MorphFillStyle } from "swf-types/morph-fill-style";
import { MorphGradient } from "swf-types/morph-gradient";
import { MorphLineStyle } from "swf-types/morph-line-style";
import { MorphShapeRecord } from "swf-types/morph-shape-record";
import { MorphShapeStyles } from "swf-types/morph-shape-styles";
import { MorphShape } from "swf-types/morph-shape";
import { ShapeRecordType } from "swf-types/shape-records/_type";
import { Edge } from "swf-types/shape-records/edge";
import { MorphEdge } from "swf-types/shape-records/morph-edge";
import { MorphStyleChange } from "swf-types/shape-records/morph-style-change";
import { StraightSRgba8 } from "swf-types/straight-s-rgba8";
import { Vector2D } from "swf-types/vector-2d";

import { parseMatrix, parseStraightSRgba8 } from "./basic-data-types.mjs";
import { parseMorphGradient } from "./gradient.mjs";
import { capStyleFromId, parseCurvedEdgeBits, parseListLength, parseStraightEdgeBits } from "./shape.mjs";

export enum MorphShapeVersion {
  MorphShape1 = 1,
  MorphShape2 = 2,
}

export function parseMorphShape(byteStream: ReadableByteStream, morphShapeVersion: MorphShapeVersion): MorphShape {
  byteStream.skip(4); // Skip offset (uint32) (TODO: Read this and use it to assert the shape is OK)
  const bitStream: ReadableBitStream = byteStream.asBitStream();
  const result: MorphShape = parseMorphShapeBits(bitStream, morphShapeVersion);
  bitStream.align();
  return result;
}

export function parseMorphShapeBits(bitStream: ReadableBitStream, morphShapeVersion: MorphShapeVersion): MorphShape {
  const styles: ParserMorphShapeStyles = parseMorphShapeStylesBits(bitStream, morphShapeVersion);
  const startRecords: MixedShapeRecord[] = parseMorphShapeStartRecordStringBits(
    bitStream,
    styles.fillBits,
    styles.lineBits,
    morphShapeVersion,
  );
  bitStream.align();
  // TODO: We should be able to skip these bits (no styles used for the endRecords)
  const fillBits: UintSize = bitStream.readUint32Bits(4);
  const lineBits: UintSize = bitStream.readUint32Bits(4);
  const records: MorphShapeRecord[] = parseMorphShapeEndRecordStringBits(
    bitStream,
    startRecords,
    fillBits,
    lineBits,
    morphShapeVersion,
  );

  return {
    initialStyles: {fill: styles.fill, line: styles.line},
    records,
  };
}

export interface ParserMorphShapeStyles {
  fill: MorphFillStyle[];
  line: MorphLineStyle[];
  fillBits: UintSize;
  lineBits: UintSize;
}

export function parseMorphShapeStylesBits(
  bitStream: ReadableBitStream,
  morphShapeVersion: MorphShapeVersion,
): ParserMorphShapeStyles {
  const byteStream: ReadableByteStream = bitStream.asByteStream();
  const fill: MorphFillStyle[] = parseMorphFillStyleList(byteStream);
  const line: MorphLineStyle[] = parseMorphLineStyleList(byteStream, morphShapeVersion);
  bitStream = byteStream.asBitStream();
  const fillBits: UintSize = bitStream.readUint32Bits(4);
  const lineBits: UintSize = bitStream.readUint32Bits(4);
  return {fill, line, fillBits, lineBits};
}

// TODO: Replace by a more reliable type: the discriminant property `type` does not have the same base type
// (ShapeRecordType and MorphShapeRecordType)
// It works here because they have corresponding keys defined in the same order
export type MixedShapeRecord = Edge | MorphStyleChange;

export function parseMorphShapeStartRecordStringBits(
  bitStream: ReadableBitStream,
  fillBits: UintSize,
  lineBits: UintSize,
  morphShapeVersion: MorphShapeVersion,
): MixedShapeRecord[] {
  const result: MixedShapeRecord[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const bytePos: number = bitStream.bytePos;
    const bitPos: number = bitStream.bitPos;
    const head: number = bitStream.readUint16Bits(6);
    if (head === 0) {
      break;
    } else {
      bitStream.bytePos = bytePos;
      bitStream.bitPos = bitPos;
    }

    const isEdge: boolean = bitStream.readBoolBits();
    if (isEdge) {
      const isStraightEdge: boolean = bitStream.readBoolBits();
      if (isStraightEdge) {
        result.push(parseStraightEdgeBits(bitStream));
      } else {
        result.push(parseCurvedEdgeBits(bitStream));
      }
    } else {
      let styles: MorphStyleChange;
      // eslint-disable-next-line prefer-const
      [styles, [fillBits, lineBits]] = parseMorphStyleChangeBits(bitStream, fillBits, lineBits, morphShapeVersion);
      result.push(styles);
    }
  }

  return result;
}

function asMorphEdge(startEdge: Edge, endEdge: Edge): MorphEdge {
  return {
    type: ShapeRecordType.Edge,
    delta: startEdge.delta,
    morphDelta: endEdge.delta,
    controlDelta: startEdge.controlDelta,
    morphControlDelta: endEdge.controlDelta,
  };
}

export function parseMorphShapeEndRecordStringBits(
  bitStream: ReadableBitStream,
  startRecords: MixedShapeRecord[],
  fillBits: UintSize,
  lineBits: UintSize,
  morphShapeVersion: MorphShapeVersion,
): MorphShapeRecord[] {
  const result: MorphShapeRecord[] = [];

  for (const startRecord of startRecords) {
    if (startRecord.type === ShapeRecordType.StyleChange && startRecord.moveTo === undefined) {
      // The end shape contains only edge (straight or curved) or moveTo records, it matches the start records
      result.push(startRecord);
      continue;
    }

    const bytePos: number = bitStream.bytePos;
    const bitPos: number = bitStream.bitPos;
    const head: number = bitStream.readUint16Bits(6);
    if (head === 0) {
      throw new incident.Incident("MissingMorphShapeEndRecords");
    } else {
      bitStream.bytePos = bytePos;
      bitStream.bitPos = bitPos;
    }

    const isEdge: boolean = bitStream.readBoolBits();
    if (isEdge) {
      if (startRecord.type !== ShapeRecordType.Edge) {
        throw new incident.Incident("UnexpectedEdge");
      }
      const startEdge: Edge = startRecord;
      const isStraightEdge: boolean = bitStream.readBoolBits();
      // tslint:disable-next-line:max-line-length
      const endEdge: Edge = isStraightEdge ? parseStraightEdgeBits(bitStream) : parseCurvedEdgeBits(bitStream);
      result.push(asMorphEdge(startEdge, endEdge));
    } else {
      if (startRecord.type !== ShapeRecordType.StyleChange) {
        throw new incident.Incident("UnexpectedStyleChange");
      }
      const startStyle: MorphStyleChange = startRecord;
      let styleChange: MorphStyleChange;
      // eslint-disable-next-line prefer-const
      [styleChange, [fillBits, lineBits]] = parseMorphStyleChangeBits(bitStream, fillBits, lineBits, morphShapeVersion);
      if (styleChange.moveTo === undefined) {
        throw new incident.Incident("ExpectedMoveTo");
      }
      result.push({...startStyle, morphMoveTo: styleChange.moveTo});
    }
  }
  const head: number = bitStream.readUint16Bits(6);
  if (head !== 0) {
    throw new incident.Incident("ExtraMorphShapeEndRecords");
  }

  return result;
}

export function parseMorphStyleChangeBits(
  bitStream: ReadableBitStream,
  fillBits: UintSize,
  lineBits: UintSize,
  morphShapeVersion: MorphShapeVersion,
): [MorphStyleChange, [UintSize, UintSize]] {
  const flags: Uint5 = bitStream.readUint32Bits(5);
  const hasMoveTo: boolean = ((flags & (1 << 0)) !== 0);
  const changeLeftFill: boolean = ((flags & (1 << 1)) !== 0);
  const changeRightFill: boolean = ((flags & (1 << 2)) !== 0);
  const changeLineStyle: boolean = ((flags & (1 << 3)) !== 0);
  const hasNewStyles: boolean = ((flags & (1 << 4)) !== 0);

  let moveTo: Vector2D | undefined = undefined;
  if (hasMoveTo) {
    const nBits: UintSize = bitStream.readUint16Bits(5);
    const x: Sint32 = bitStream.readSint32Bits(nBits);
    const y: Sint32 = bitStream.readSint32Bits(nBits);
    moveTo = {x, y};
  }

  const leftFill: UintSize | undefined = changeLeftFill ? bitStream.readUint16Bits(fillBits) : undefined;
  const rightFill: UintSize | undefined = changeRightFill ? bitStream.readUint16Bits(fillBits) : undefined;
  const lineStyle: UintSize | undefined = changeLineStyle ? bitStream.readUint16Bits(lineBits) : undefined;

  let newStyles: MorphShapeStyles | undefined = undefined;
  if (hasNewStyles) {
    const styles: ParserMorphShapeStyles = parseMorphShapeStylesBits(bitStream, morphShapeVersion);
    newStyles = {
      fill: styles.fill,
      line: styles.line,
    };
    fillBits = styles.fillBits;
    lineBits = styles.lineBits;
  }

  const styleChangeRecord: MorphStyleChange = {
    type: ShapeRecordType.StyleChange,
    moveTo,
    morphMoveTo: undefined,
    leftFill,
    rightFill,
    lineStyle,
    newStyles,
  };

  return [styleChangeRecord, [fillBits, lineBits]];
}

export function parseMorphFillStyleList(byteStream: ReadableByteStream): MorphFillStyle[] {
  const result: MorphFillStyle[] = [];
  const len: UintSize = parseListLength(byteStream, true);
  for (let i: UintSize = 0; i < len; i++) {
    result.push(parseMorphFillStyle(byteStream));
  }
  return result;
}

export function parseMorphFillStyle(byteStream: ReadableByteStream): MorphFillStyle {
  switch (byteStream.readUint8()) {
    case 0x00:
      return parseMorphSolidFill(byteStream);
    case 0x10:
      return parseMorphLinearGradientFill(byteStream);
    case 0x12:
      return parseMorphRadialGradientFill(byteStream);
    case 0x13:
      // TODO: Check if this requires shapeVersion >= Shape4
      return parseMorphFocalGradientFill(byteStream);
    case 0x40:
      return parseMorphBitmapFill(byteStream, true, true);
    case 0x41:
      return parseMorphBitmapFill(byteStream, false, true);
    case 0x42:
      return parseMorphBitmapFill(byteStream, true, false);
    case 0x43:
      return parseMorphBitmapFill(byteStream, false, false);
    default:
      throw new Error("Unexpected morph fill style");
  }
}

export function parseMorphBitmapFill(
  byteStream: ReadableByteStream,
  repeating: boolean,
  smoothed: boolean,
): fillStyles.MorphBitmap {
  const bitmapId: Uint16 = byteStream.readUint16LE();
  const matrix: Matrix = parseMatrix(byteStream);
  const morphMatrix: Matrix = parseMatrix(byteStream);
  return {
    type: FillStyleType.Bitmap,
    bitmapId,
    matrix,
    morphMatrix,
    repeating,
    smoothed,
  };
}

export function parseMorphFocalGradientFill(byteStream: ReadableByteStream): fillStyles.MorphFocalGradient {
  const matrix: Matrix = parseMatrix(byteStream);
  const morphMatrix: Matrix = parseMatrix(byteStream);
  const gradient: MorphGradient = parseMorphGradient(byteStream, true);
  const focalPoint: Sfixed8P8 = Sfixed8P8.fromEpsilons(byteStream.readSint16LE());
  const morphFocalPoint: Sfixed8P8 = Sfixed8P8.fromEpsilons(byteStream.readSint16LE());
  return {
    type: FillStyleType.FocalGradient,
    matrix,
    morphMatrix,
    gradient,
    focalPoint,
    morphFocalPoint,
  };
}

export function parseMorphLinearGradientFill(
  byteStream: ReadableByteStream,
): fillStyles.MorphLinearGradient {
  const matrix: Matrix = parseMatrix(byteStream);
  const morphMatrix: Matrix = parseMatrix(byteStream);
  const gradient: MorphGradient = parseMorphGradient(byteStream, true);
  return {
    type: FillStyleType.LinearGradient,
    matrix,
    morphMatrix,
    gradient,
  };
}

export function parseMorphRadialGradientFill(
  byteStream: ReadableByteStream,
): fillStyles.MorphRadialGradient {
  const matrix: Matrix = parseMatrix(byteStream);
  const morphMatrix: Matrix = parseMatrix(byteStream);
  const gradient: MorphGradient = parseMorphGradient(byteStream, true);
  return {
    type: FillStyleType.RadialGradient,
    matrix,
    morphMatrix,
    gradient,
  };
}

export function parseMorphSolidFill(byteStream: ReadableByteStream): fillStyles.MorphSolid {
  const color: StraightSRgba8 = parseStraightSRgba8(byteStream);
  const morphColor: StraightSRgba8 = parseStraightSRgba8(byteStream);
  return {
    type: FillStyleType.Solid,
    color,
    morphColor,
  };
}

export function parseMorphLineStyleList(
  byteStream: ReadableByteStream,
  morphShapeVersion: MorphShapeVersion,
): MorphLineStyle[] {
  const result: MorphLineStyle[] = [];
  const len: UintSize = parseListLength(byteStream, true);
  for (let i: UintSize = 0; i < len; i++) {
    if (morphShapeVersion >= MorphShapeVersion.MorphShape2) {
      result.push(parseMorphLineStyle2(byteStream));
    } else {
      result.push(parseMorphLineStyle1(byteStream));
    }
  }
  return result;
}

export function parseMorphLineStyle1(byteStream: ReadableByteStream): MorphLineStyle {
  const width: Uint16 = byteStream.readUint16LE();
  const morphWidth: Uint16 = byteStream.readUint16LE();
  const color: StraightSRgba8 = parseStraightSRgba8(byteStream);
  const morphColor: StraightSRgba8 = parseStraightSRgba8(byteStream);
  return {
    width,
    morphWidth,
    startCap: CapStyle.Round,
    endCap: CapStyle.Round,
    join: {type: JoinStyleType.Round},
    noHScale: false,
    noVScale: false,
    noClose: false,
    pixelHinting: false,
    fill: {
      type: FillStyleType.Solid,
      color,
      morphColor,
    },
  };
}

export function parseMorphLineStyle2(byteStream: ReadableByteStream): MorphLineStyle {
  const width: Uint16 = byteStream.readUint16LE();
  const morphWidth: Uint16 = byteStream.readUint16LE();

  const flags: Uint16 = byteStream.readUint16LE();
  const pixelHinting: boolean = (flags & (1 << 0)) !== 0;
  const noVScale: boolean = (flags & (1 << 1)) !== 0;
  const noHScale: boolean = (flags & (1 << 2)) !== 0;
  const hasFill: boolean = (flags & (1 << 3)) !== 0;
  const joinStyleId: Uint2 = ((flags >>> 4) & 0b11) as Uint2;
  const startCapStyleId: Uint2 = ((flags >>> 6) & 0b11) as Uint2;
  const endCapStyleId: Uint2 = ((flags >>> 8) & 0b11) as Uint2;
  const noClose: boolean = (flags & (1 << 10)) !== 0;
  // (Skip bits [11, 15])

  let join: JoinStyle;
  switch (joinStyleId) {
    case 0:
      join = {type: JoinStyleType.Round};
      break;
    case 1:
      join = {type: JoinStyleType.Bevel};
      break;
    case 2:
      join = {type: JoinStyleType.Miter, limit: Sfixed8P8.fromEpsilons(byteStream.readSint16LE())};
      break;
    default:
      throw new incident.Incident("UnexpectedJoinStyleId", {id: joinStyleId});
  }

  let fill: MorphFillStyle;
  if (hasFill) {
    fill = parseMorphFillStyle(byteStream);
  } else {
    const color: StraightSRgba8 = parseStraightSRgba8(byteStream);
    const morphColor: StraightSRgba8 = parseStraightSRgba8(byteStream);
    fill = {type: FillStyleType.Solid, color, morphColor};
  }

  return {
    width,
    morphWidth,
    startCap: capStyleFromId(startCapStyleId),
    endCap: capStyleFromId(endCapStyleId),
    join,
    noHScale,
    noVScale,
    noClose,
    pixelHinting,
    fill,
  };
}
