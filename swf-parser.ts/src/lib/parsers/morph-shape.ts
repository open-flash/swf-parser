import { parseMatrix, parseSRgb8, parseStraightSRgba8 } from "./basic-data-types";
import { BitStream, ByteStream } from "../stream";
import { parseMorphGradient } from "./gradient";
import { Sint32, Uint16, UintSize } from "semantic-types";
import { MorphLineStyle } from "swf-tree/morph-line-style";
import { MorphFillStyle } from "swf-tree/morph-fill-style";
import { MorphShape } from "swf-tree/morph-shape";
import { MorphShapeRecord } from "swf-tree/morph-shape-record";
import { morphFillStyles, MorphFillStyleType } from "swf-tree";
import { parseCurvedEdgeBits, parseListLength, parseStraightEdgeBits, } from "./shape";
import { Matrix } from "swf-tree/matrix";
import { MorphGradient } from "swf-tree/morph-gradient";
import { Fixed8P8 } from "swf-tree/fixed-point/fixed8p8";
import { StraightSRgba8 } from "swf-tree/straight-s-rgba8";
import { StraightEdge } from "swf-tree/shape-records/straight-edge";
import { CurvedEdge } from "swf-tree/shape-records/curved-edge";
import { MorphStyleChange } from "swf-tree/morph-shape-records/morph-style-change";
import { Vector2D } from "swf-tree/vector-2d";
import { MorphShapeRecordType } from "swf-tree/morph-shape-records/_type";
import { Incident } from "incident";
import { MorphStraightEdge } from "swf-tree/morph-shape-records/morph-straight-edge";
import { MorphCurvedEdge } from "swf-tree/morph-shape-records/morph-curved-edge";
import { ShapeRecordType } from "swf-tree/shape-records/_type";
import { CapStyle } from "swf-tree/cap-style";
import { JoinStyleType } from "swf-tree/join-styles/_type";

export enum MorphShapeVersion {
  MorphShape1,
  MorphShape2,
}

export function parseMorphShape(byteStream: ByteStream, version: MorphShapeVersion): MorphShape {
  byteStream.skip(4); // Skip offset (uint32)
  const bitStream: BitStream = byteStream.asBitStream();
  const result: MorphShape = parseMorphShapeBits(bitStream, version);
  bitStream.align();
  return result;
}

export function parseMorphShapeBits(bitStream: BitStream, version: MorphShapeVersion): MorphShape {
  const styles: MorphShapeStyles = parseMorphShapeStylesBits(bitStream, version);
  const startRecords: MixedShapeRecord[] = parseMorphShapeStartRecordStringBits(
    bitStream,
    styles.fillBits,
    styles.lineBits,
    version,
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
    version,
  );

  return {
    fillStyles: styles.fill,
    lineStyles: styles.line,
    records,
  };
}

export interface MorphShapeStyles {
  fill: MorphFillStyle[];
  line: MorphLineStyle[];
  fillBits: UintSize;
  lineBits: UintSize;
}

export function parseMorphShapeStylesBits(bitStream: BitStream, version: MorphShapeVersion): MorphShapeStyles {
  const byteStream: ByteStream = bitStream.asByteStream();
  const fill: MorphFillStyle[] = parseMorphFillStyleList(byteStream);
  const line: MorphLineStyle[] = parseMorphLineStyleList(byteStream, version);
  bitStream = byteStream.asBitStream();
  const fillBits: UintSize = bitStream.readUint32Bits(4);
  const lineBits: UintSize = bitStream.readUint32Bits(4);
  return {fill, line, fillBits, lineBits};
}

// TODO: Replace by a more reliable type: the discriminant property `type` does not have the same base type (ShapeRecordType and MorphShapeRecordType)
// It works here because they have corresponding keys defined in the same order
export type MixedShapeRecord = StraightEdge | CurvedEdge | MorphStyleChange;

export function parseMorphShapeStartRecordStringBits(
  bitStream: BitStream,
  fillBits: UintSize,
  lineBits: UintSize,
  version: MorphShapeVersion,
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
      [styles, [fillBits, lineBits]] = parseMorphStyleChangeBits(bitStream, fillBits, lineBits, version);
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
      type: MorphShapeRecordType.MorphStraightEdge,
      startDelta: startEdge.delta,
      endDelta: endEdge.delta,
    };
  }
  const startCurve: CurvedEdge = asCurvedEdge(startEdge);
  const endCurve: CurvedEdge = asCurvedEdge(endEdge);
  return {
    type: MorphShapeRecordType.MorphCurvedEdge,
    startControlDelta: startCurve.controlDelta,
    endControlDelta: endCurve.controlDelta,
    startAnchorDelta: startCurve.anchorDelta,
    endAnchorDelta: endCurve.anchorDelta,
  };
}

export function parseMorphShapeEndRecordStringBits(
  bitStream: BitStream,
  startRecords: MixedShapeRecord[],
  fillBits: UintSize,
  lineBits: UintSize,
  version: MorphShapeVersion,
): MorphShapeRecord[] {
  const result: MorphShapeRecord[] = [];

  for (const startRecord of startRecords) {
    if (startRecord.type === MorphShapeRecordType.MorphStyleChange && startRecord.startMoveTo === undefined) {
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
      const endEdge: StraightEdge | CurvedEdge = isStraightEdge ? parseStraightEdgeBits(bitStream) : parseCurvedEdgeBits(bitStream);
      result.push(asMorphEdge(startEdge, endEdge));
    } else {
      if (startRecord.type !== MorphShapeRecordType.MorphStyleChange) {
        throw new Incident("UnexpectedStyleChange");
      }
      const startStyle: MorphStyleChange = startRecord;
      let styleChange: MorphStyleChange;
      [styleChange, [fillBits, lineBits]] = parseMorphStyleChangeBits(bitStream, fillBits, lineBits, version);
      if (styleChange.startMoveTo === undefined) {
        throw new Incident("ExpectedMoveTo");
      }
      result.push({...startStyle, endMoveTo: styleChange.startMoveTo});
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
  version: MorphShapeVersion,
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

  let fillStyles: MorphFillStyle[] | undefined = undefined;
  let lineStyles: MorphLineStyle[] | undefined = undefined;
  if (hasNewStyles) {
    const styles: MorphShapeStyles = parseMorphShapeStylesBits(bitStream, version);
    fillStyles = styles.fill;
    lineStyles = styles.line;
    fillBits = styles.fillBits;
    lineBits = styles.lineBits;
  }

  const styleChangeRecord: MorphStyleChange = {
    type: MorphShapeRecordType.MorphStyleChange,
    startMoveTo: moveTo,
    endMoveTo: undefined,
    leftFill,
    rightFill,
    lineStyle,
    fillStyles,
    lineStyles,
  };

  return [styleChangeRecord, [fillBits, lineBits]];
}

export function parseMorphFillStyleList(byteStream: ByteStream): MorphFillStyle[] {
  const result: MorphFillStyle[] = [];
  const len: UintSize = parseListLength(byteStream, true);
  for (let i: UintSize = 0; i < len; i++) {
    result.push(parseMorphFillStyle(byteStream, true));
  }
  return result;
}

export function parseMorphFillStyle(byteStream: ByteStream, withAlpha: boolean): MorphFillStyle {
  // TODO: Remove `withAlph` parameter (always true)
  switch (byteStream.readUint8()) {
    case 0x00:
      return parseMorphSolidFill(byteStream, withAlpha);
    case 0x10:
      return parseMorphLinearGradientFill(byteStream, withAlpha);
    case 0x12:
      return parseMorphRadialGradientFill(byteStream, withAlpha);
    case 0x13:
      return parseMorphFocalGradientFill(byteStream, withAlpha);
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
): morphFillStyles.Bitmap {
  const bitmapId: Uint16 = byteStream.readUint16LE();
  const startMatrix: Matrix = parseMatrix(byteStream);
  const endMatrix: Matrix = parseMatrix(byteStream);
  return {
    type: MorphFillStyleType.Bitmap,
    bitmapId,
    startMatrix,
    endMatrix,
    repeating,
    smoothed,
  };
}

export function parseMorphFocalGradientFill(byteStream: ByteStream, withAlpha: boolean): morphFillStyles.FocalGradient {
  const startMatrix: Matrix = parseMatrix(byteStream);
  const endMatrix: Matrix = parseMatrix(byteStream);
  const gradient: MorphGradient = parseMorphGradient(byteStream, withAlpha);
  const startFocalPoint: Fixed8P8 = byteStream.readFixed8P8LE();
  const endFocalPoint: Fixed8P8 = byteStream.readFixed8P8LE();
  return {
    type: MorphFillStyleType.FocalGradient,
    startMatrix,
    endMatrix,
    gradient,
    startFocalPoint,
    endFocalPoint,
  };
}

export function parseMorphLinearGradientFill(
  byteStream: ByteStream,
  withAlpha: boolean,
): morphFillStyles.LinearGradient {
  const startMatrix: Matrix = parseMatrix(byteStream);
  const endMatrix: Matrix = parseMatrix(byteStream);
  const gradient: MorphGradient = parseMorphGradient(byteStream, withAlpha);
  const focalPoint: Fixed8P8 = byteStream.readFixed8P8LE();
  return {
    type: MorphFillStyleType.LinearGradient,
    startMatrix,
    endMatrix,
    gradient,
  };
}

export function parseMorphRadialGradientFill(
  byteStream: ByteStream,
  withAlpha: boolean,
): morphFillStyles.RadialGradient {
  const startMatrix: Matrix = parseMatrix(byteStream);
  const endMatrix: Matrix = parseMatrix(byteStream);
  const gradient: MorphGradient = parseMorphGradient(byteStream, withAlpha);
  return {
    type: MorphFillStyleType.RadialGradient,
    startMatrix,
    endMatrix,
    gradient,
  };
}

export function parseMorphSolidFill(byteStream: ByteStream, withAlpha: boolean): morphFillStyles.Solid {
  let startColor: StraightSRgba8;
  let endColor: StraightSRgba8;
  if (withAlpha) {
    startColor = parseStraightSRgba8(byteStream);
    endColor = parseStraightSRgba8(byteStream);
  } else {
    startColor = {...parseSRgb8(byteStream), a: 255};
    endColor = {...parseSRgb8(byteStream), a: 255};
  }
  return {
    type: MorphFillStyleType.Solid,
    startColor,
    endColor,
  };
}

export function parseMorphLineStyleList(byteStream: ByteStream, version: MorphShapeVersion): MorphLineStyle[] {
  const result: MorphLineStyle[] = [];
  const len: UintSize = parseListLength(byteStream, true);
  for (let i: UintSize = 0; i < len; i++) {
    result.push(version === MorphShapeVersion.MorphShape1 ? parseMorphLineStyle1(byteStream) : parseMorphLineStyle2(byteStream));
  }
  return result;
}

export function parseMorphLineStyle1(byteStream: ByteStream): MorphLineStyle {
  const startWidth: Uint16 = byteStream.readUint16LE();
  const endWidth: Uint16 = byteStream.readUint16LE();
  const startColor: StraightSRgba8 = parseStraightSRgba8(byteStream);
  const endColor: StraightSRgba8 = parseStraightSRgba8(byteStream);
  return {
    startWidth,
    endWidth,
    startCap: CapStyle.Round,
    endCap: CapStyle.Round,
    join: {type: JoinStyleType.Round},
    noHScale: false,
    noVScale: false,
    noClose: false,
    pixelHinting: false,
    fill: {
      type: MorphFillStyleType.Solid,
      startColor,
      endColor,
    },
  };
}

export function parseMorphLineStyle2(byteStream: ByteStream): MorphLineStyle {
  throw new Incident("NotImplemented", "parseMorphLineStyle2");
}
