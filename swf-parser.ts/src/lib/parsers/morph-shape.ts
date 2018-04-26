import { Incident } from "incident";
import { Sint32, Uint16, Uint2, UintSize } from "semantic-types";
import { fillStyles } from "swf-tree";
import { CapStyle } from "swf-tree/cap-style";
import { JoinStyle } from "swf-tree/join-style";
import { JoinStyleType } from "swf-tree/join-styles/_type";
import { Matrix } from "swf-tree/matrix";
import { MorphFillStyle } from "swf-tree/morph-fill-style";
import { MorphGradient } from "swf-tree/morph-gradient";
import { MorphLineStyle } from "swf-tree/morph-line-style";
import { MorphShape } from "swf-tree/morph-shape";
import { MorphShapeRecord } from "swf-tree/morph-shape-record";
import { ShapeRecordType } from "swf-tree/shape-records/_type";
import { CurvedEdge } from "swf-tree/shape-records/curved-edge";
import { StraightEdge } from "swf-tree/shape-records/straight-edge";
import { StraightSRgba8 } from "swf-tree/straight-s-rgba8";
import { Vector2D } from "swf-tree/vector-2d";
import { BitStream, ByteStream } from "../stream";
import { parseMatrix, parseStraightSRgba8 } from "./basic-data-types";
import { parseMorphGradient } from "./gradient";
import { capStyleFromId, parseCurvedEdgeBits, parseListLength, parseStraightEdgeBits } from "./shape";
import { MorphCurvedEdge, MorphStraightEdge, MorphStyleChange } from "swf-tree/shape-records";
import { FillStyleType, Sfixed8P8 } from "swf-tree";
import { ShapeStyles } from "swf-tree/shape-style";
import { MorphShapeStyles } from "swf-tree/morph-shape-style";

export enum MorphShapeVersion {
  MorphShape1 = 1,
  MorphShape2 = 2,
}

export function parseMorphShape(byteStream: ByteStream, morphShapeVersion: MorphShapeVersion): MorphShape {
  byteStream.skip(4); // Skip offset (uint32)
  const bitStream: BitStream = byteStream.asBitStream();
  const result: MorphShape = parseMorphShapeBits(bitStream, morphShapeVersion);
  bitStream.align();
  return result;
}

export function parseMorphShapeBits(bitStream: BitStream, morphShapeVersion: MorphShapeVersion): MorphShape {
  const styles: _MorphShapeStyles = parseMorphShapeStylesBits(bitStream, morphShapeVersion);
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
    fillStyles: styles.fill,
    lineStyles: styles.line,
    records,
  };
}

export interface _MorphShapeStyles {
  fill: MorphFillStyle[];
  line: MorphLineStyle[];
  fillBits: UintSize;
  lineBits: UintSize;
}

export function parseMorphShapeStylesBits(
  bitStream: BitStream,
  morphShapeVersion: MorphShapeVersion,
): _MorphShapeStyles {
  const byteStream: ByteStream = bitStream.asByteStream();
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
export type MixedShapeRecord = StraightEdge | CurvedEdge | MorphStyleChange;

export function parseMorphShapeStartRecordStringBits(
  bitStream: BitStream,
  fillBits: UintSize,
  lineBits: UintSize,
  morphShapeVersion: MorphShapeVersion,
): MixedShapeRecord[] {
  const result: MixedShapeRecord[] = [];

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
      [styles, [fillBits, lineBits]] = parseMorphStyleChangeBits(bitStream, fillBits, lineBits, morphShapeVersion);
      result.push(styles);
    }
  }

  return result;
}

function asCurvedEdge(edge: StraightEdge | CurvedEdge): CurvedEdge {
  if (edge.type === ShapeRecordType.CurvedEdge) {
    return edge;
  }
  return {
    type: ShapeRecordType.CurvedEdge,
    controlDelta: {x: edge.delta.x / 2, y: edge.delta.y / 2},
    anchorDelta: {x: edge.delta.x / 2, y: edge.delta.y / 2},
  };
}

function asMorphEdge(
  startEdge: StraightEdge | CurvedEdge,
  endEdge: StraightEdge | CurvedEdge,
): MorphStraightEdge | MorphCurvedEdge {
  if (startEdge.type === ShapeRecordType.StraightEdge && endEdge.type === ShapeRecordType.StraightEdge) {
    return {
      type: ShapeRecordType.StraightEdge,
      delta: startEdge.delta,
      morphDelta: endEdge.delta,
    };
  }
  const startCurve: CurvedEdge = asCurvedEdge(startEdge);
  const endCurve: CurvedEdge = asCurvedEdge(endEdge);
  return {
    type: ShapeRecordType.CurvedEdge,
    controlDelta: startCurve.controlDelta,
    anchorDelta: startCurve.anchorDelta,
    morphControlDelta: endCurve.controlDelta,
    morphAnchorDelta: endCurve.anchorDelta,
  };
}

export function parseMorphShapeEndRecordStringBits(
  bitStream: BitStream,
  startRecords: MixedShapeRecord[],
  fillBits: UintSize,
  lineBits: UintSize,
  morphShapeVersion: MorphShapeVersion,
): MorphShapeRecord[] {
  const result: MorphShapeRecord[] = [];

  for (const startRecord of startRecords) {
    if (startRecord.type === ShapeRecordType.StyleChange && startRecord.moveTo === undefined) {
      // The end shape contains only edge (straight or curved) or moveTo records, it matches the start records
      continue;
    }

    const bytePos: number = bitStream.bytePos;
    const bitPos: number = bitStream.bitPos;
    const head: number = bitStream.readUint16Bits(6);
    if (head === 0) {
      throw new Incident("MissingMorphShapeEndRecords");
    } else {
      bitStream.bytePos = bytePos;
      bitStream.bitPos = bitPos;
    }

    const isEdge: boolean = bitStream.readBoolBits();
    if (isEdge) {
      if (startRecord.type !== ShapeRecordType.StraightEdge && startRecord.type !== ShapeRecordType.CurvedEdge) {
        throw new Incident("UnexpectedEdge");
      }
      const startEdge: StraightEdge | CurvedEdge = startRecord;
      const isStraightEdge: boolean = bitStream.readBoolBits();
      // tslint:disable-next-line:max-line-length
      const endEdge: StraightEdge | CurvedEdge = isStraightEdge ? parseStraightEdgeBits(bitStream) : parseCurvedEdgeBits(bitStream);
      result.push(asMorphEdge(startEdge, endEdge));
    } else {
      if (startRecord.type !== ShapeRecordType.StyleChange) {
        throw new Incident("UnexpectedStyleChange");
      }
      const startStyle: MorphStyleChange = startRecord;
      let styleChange: MorphStyleChange;
      [styleChange, [fillBits, lineBits]] = parseMorphStyleChangeBits(bitStream, fillBits, lineBits, morphShapeVersion);
      if (styleChange.moveTo === undefined) {
        throw new Incident("ExpectedMoveTo");
      }
      result.push({...startStyle, morphMoveTo: styleChange.moveTo});
    }
  }
  const head: number = bitStream.readUint16Bits(6);
  if (head !== 0) {
    throw new Incident("ExtraMorphShapeEndRecords");
  }

  return result;
}

export function parseMorphStyleChangeBits(
  bitStream: BitStream,
  fillBits: UintSize,
  lineBits: UintSize,
  morphShapeVersion: MorphShapeVersion,
): [MorphStyleChange, [UintSize, UintSize]] {
  const hasNewStyles: boolean = bitStream.readBoolBits();
  const changeLineStyle: boolean = bitStream.readBoolBits();
  const changeRightFill: boolean = bitStream.readBoolBits();
  const changeLeftFill: boolean = bitStream.readBoolBits();
  const hasMoveTo: boolean = bitStream.readBoolBits();

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
    const styles: _MorphShapeStyles = parseMorphShapeStylesBits(bitStream, morphShapeVersion);
    newStyles = {
      fill: styles.fill,
      line: styles.line,
    };
    fillBits = styles.fillBits;
    lineBits = styles.lineBits;
  }

  const styleChangeRecord: MorphStyleChange = {
    type: ShapeRecordType.StyleChange,
    moveTo: moveTo,
    morphMoveTo: undefined,
    leftFill,
    rightFill,
    lineStyle,
    newStyles,
  };

  return [styleChangeRecord, [fillBits, lineBits]];
}

export function parseMorphFillStyleList(byteStream: ByteStream): MorphFillStyle[] {
  const result: MorphFillStyle[] = [];
  const len: UintSize = parseListLength(byteStream, true);
  for (let i: UintSize = 0; i < len; i++) {
    result.push(parseMorphFillStyle(byteStream));
  }
  return result;
}

export function parseMorphFillStyle(byteStream: ByteStream): MorphFillStyle {
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
  byteStream: ByteStream,
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

export function parseMorphFocalGradientFill(byteStream: ByteStream): fillStyles.MorphFocalGradient {
  const matrix: Matrix = parseMatrix(byteStream);
  const morphMatrix: Matrix = parseMatrix(byteStream);
  const gradient: MorphGradient = parseMorphGradient(byteStream, true);
  const focalPoint: Sfixed8P8 = byteStream.readFixed8P8LE();
  const morphFocalPoint: Sfixed8P8 = byteStream.readFixed8P8LE();
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
  byteStream: ByteStream,
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
  byteStream: ByteStream,
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

export function parseMorphSolidFill(byteStream: ByteStream): fillStyles.MorphSolid {
  const color: StraightSRgba8 = parseStraightSRgba8(byteStream);
  const morphColor: StraightSRgba8 = parseStraightSRgba8(byteStream);
  return {
    type: FillStyleType.Solid,
    color,
    morphColor,
  };
}

export function parseMorphLineStyleList(
  byteStream: ByteStream,
  morphShapeVersion: MorphShapeVersion,
): MorphLineStyle[] {
  const result: MorphLineStyle[] = [];
  const len: UintSize = parseListLength(byteStream, true);
  for (let i: UintSize = 0; i < len; i++) {
    if (morphShapeVersion < MorphShapeVersion.MorphShape2) {
      result.push(parseMorphLineStyle1(byteStream));
    } else {
      result.push(parseMorphLineStyle2(byteStream));
    }
  }
  return result;
}

export function parseMorphLineStyle1(byteStream: ByteStream): MorphLineStyle {
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

export function parseMorphLineStyle2(byteStream: ByteStream): MorphLineStyle {
  const width: Uint16 = byteStream.readUint16LE();
  const morphWidth: Uint16 = byteStream.readUint16LE();

  const flags: Uint16 = byteStream.readUint16LE();
  // (Skip first 5 bits)
  const noClose: boolean = (flags & (1 << 10)) !== 0;
  const endCapStyleId: Uint2 = ((flags >>> 8) & 0b11) as Uint2;
  const startCapStyleId: Uint2 = ((flags >>> 6) & 0b11) as Uint2;
  const joinStyleId: Uint2 = ((flags >>> 4) & 0b11) as Uint2;
  const hasFill: boolean = (flags & (1 << 3)) !== 0;
  const noHScale: boolean = (flags & (1 << 2)) !== 0;
  const noVScale: boolean = (flags & (1 << 1)) !== 0;
  const pixelHinting: boolean = (flags & (1 << 0)) !== 0;

  let join: JoinStyle;
  switch (joinStyleId) {
    case 0:
      join = {type: JoinStyleType.Round};
      break;
    case 1:
      join = {type: JoinStyleType.Bevel};
      break;
    case 2:
      join = {type: JoinStyleType.Miter, limit: byteStream.readFixed8P8LE()};
      break;
    default:
      throw new Incident("UnexpectedJoinStyleId", {id: joinStyleId});
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
