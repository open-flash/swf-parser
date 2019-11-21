import { ReadableBitStream, ReadableByteStream } from "@open-flash/stream";
import { Incident } from "incident";
import { Sint32, Uint16, Uint2, Uint5, Uint8, UintSize } from "semantic-types";
import {
  CapStyle,
  FillStyle,
  fillStyles,
  FillStyleType,
  Glyph,
  Gradient,
  JoinStyleType,
  LineStyle,
  Matrix,
  Sfixed8P8,
  Shape,
  ShapeRecord,
  shapeRecords,
  ShapeRecordType,
  StraightSRgba8,
  Vector2D,
} from "swf-types";
import { JoinStyle } from "swf-types/join-style";
import { ShapeStyles } from "swf-types/shape-styles";
import { parseMatrix, parseSRgb8, parseStraightSRgba8 } from "./basic-data-types";
import { parseGradient } from "./gradient";

export enum ShapeVersion {
  Shape1 = 1,
  Shape2 = 2,
  Shape3 = 3,
  Shape4 = 4,
}

export function parseGlyph(byteStream: ReadableByteStream): Glyph {
  const bitStream: ReadableBitStream = byteStream.asBitStream();
  const result: Glyph = parseGlyphBits(bitStream);
  bitStream.align();
  return result;
}

export function parseGlyphBits(bitStream: ReadableBitStream): Glyph {
  const fillBits: UintSize = bitStream.readUint32Bits(4);
  const lineBits: UintSize = bitStream.readUint32Bits(4);
  // TODO: Check which shape version to use
  const records: ShapeRecord[] = parseShapeRecordStringBits(bitStream, fillBits, lineBits, ShapeVersion.Shape1);
  return {records};
}

export function parseShape(byteStream: ReadableByteStream, shapeVersion: ShapeVersion): Shape {
  const bitStream: ReadableBitStream = byteStream.asBitStream();
  const result: Shape = parseShapeBits(bitStream, shapeVersion);
  bitStream.align();
  return result;
}

export function parseShapeBits(bitStream: ReadableBitStream, shapeVersion: ShapeVersion): Shape {
  const styles: ParserShapeStyles = parseShapeStylesBits(bitStream, shapeVersion);
  const records: ShapeRecord[] = parseShapeRecordStringBits(
    bitStream,
    styles.fillBits,
    styles.lineBits,
    shapeVersion,
  );
  return {
    initialStyles: {fill: styles.fill, line: styles.line},
    records,
  };
}

export interface ParserShapeStyles {
  fill: FillStyle[];
  line: LineStyle[];
  fillBits: UintSize;
  lineBits: UintSize;
}

export function parseShapeStylesBits(bitStream: ReadableBitStream, shapeVersion: ShapeVersion): ParserShapeStyles {
  const byteStream: ReadableByteStream = bitStream.asByteStream();
  const fill: FillStyle[] = parseFillStyleList(byteStream, shapeVersion);
  const line: LineStyle[] = parseLineStyleList(byteStream, shapeVersion);
  bitStream = byteStream.asBitStream();
  const fillBits: UintSize = bitStream.readUint32Bits(4);
  const lineBits: UintSize = bitStream.readUint32Bits(4);
  return {fill, line, fillBits, lineBits};
}

export function parseShapeRecordStringBits(
  bitStream: ReadableBitStream,
  fillBits: UintSize,
  lineBits: UintSize,
  shapeVersion: ShapeVersion,
): ShapeRecord[] {
  const result: ShapeRecord[] = [];

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
      let styles: shapeRecords.StyleChange;
      [styles, [fillBits, lineBits]] = parseStyleChangeBits(bitStream, fillBits, lineBits, shapeVersion);
      result.push(styles);
    }
  }

  return result;
}

export function parseCurvedEdgeBits(bitStream: ReadableBitStream): shapeRecords.Edge {
  const nBits: UintSize = bitStream.readUint16Bits(4) + 2;
  const controlX: Sint32 = bitStream.readSint32Bits(nBits);
  const controlY: Sint32 = bitStream.readSint32Bits(nBits);
  const anchorX: Sint32 = bitStream.readSint32Bits(nBits);
  const anchorY: Sint32 = bitStream.readSint32Bits(nBits);
  return {
    type: ShapeRecordType.Edge,
    controlDelta: {x: controlX, y: controlY},
    delta: {x: controlX + anchorX, y: controlY + anchorY},
  };
}

export function parseStraightEdgeBits(bitStream: ReadableBitStream): shapeRecords.Edge {
  const nBits: UintSize = bitStream.readUint16Bits(4) + 2;
  const isDiagonal: boolean = bitStream.readBoolBits();
  const isVertical: boolean = !isDiagonal && bitStream.readBoolBits();
  const deltaX: Sint32 = isDiagonal || !isVertical ? bitStream.readSint32Bits(nBits) : 0;
  const deltaY: Sint32 = isDiagonal || isVertical ? bitStream.readSint32Bits(nBits) : 0;
  return {
    type: ShapeRecordType.Edge,
    delta: {x: deltaX, y: deltaY},
  };
}

export function parseStyleChangeBits(
  bitStream: ReadableBitStream,
  fillBits: UintSize,
  lineBits: UintSize,
  shapeVersion: ShapeVersion,
): [shapeRecords.StyleChange, [UintSize, UintSize]] {
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

  let newStyles: ShapeStyles | undefined = undefined;
  if (hasNewStyles) {
    // TODO: Shumway forces `hasNewStyle` to `false` if shapeVersion is `Shape1`, should we do it too?
    // https://github.com/mozilla/shumway/blob/16451d8836fa85f4b16eeda8b4bda2fa9e2b22b0/src/swf/parser/module.ts#L851
    const styles: ParserShapeStyles = parseShapeStylesBits(bitStream, shapeVersion);
    newStyles = {
      fill: styles.fill,
      line: styles.line,
    };
    fillBits = styles.fillBits;
    lineBits = styles.lineBits;
  }

  const styleChangeRecord: shapeRecords.StyleChange = {
    type: ShapeRecordType.StyleChange,
    moveTo,
    leftFill,
    rightFill,
    lineStyle,
    newStyles,
  };

  return [styleChangeRecord, [fillBits, lineBits]];
}

/**
 * Parse a fill style list length or line style list length.
 *
 * @param byteStream Stream to use to parse this list length. Will mutate its state.
 * @param allowExtended Allow extended size (`> 255`). Here are the recommended values:
 *                      - `true` for `DefineShape2`, `DefineShape3`, `DefineShape4`
 *                      - `false` for `DefineShape`
 * @returns List length
 */
export function parseListLength(byteStream: ReadableByteStream, allowExtended: boolean): UintSize {
  const len: UintSize = byteStream.readUint8();
  if (len === 0xff && allowExtended) {
    return byteStream.readUint16LE();
  } else {
    return len;
  }
}

export function parseFillStyleList(
  byteStream: ReadableByteStream,
  shapeVersion: ShapeVersion,
): FillStyle[] {
  const result: FillStyle[] = [];
  const len: UintSize = parseListLength(byteStream, shapeVersion >= ShapeVersion.Shape2);
  for (let i: UintSize = 0; i < len; i++) {
    result.push(parseFillStyle(byteStream, shapeVersion >= ShapeVersion.Shape3));
  }
  return result;
}

export function parseFillStyle(byteStream: ReadableByteStream, withAlpha: boolean): FillStyle {
  const code: Uint8 = byteStream.readUint8();
  switch (code) {
    case 0x00:
      return parseSolidFill(byteStream, withAlpha);
    case 0x10:
      return parseLinearGradientFill(byteStream, withAlpha);
    case 0x12:
      return parseRadialGradientFill(byteStream, withAlpha);
    case 0x13:
      // TODO: Check if this requires shapeVersion >= Shape4
      return parseFocalGradientFill(byteStream, withAlpha);
    case 0x40:
      return parseBitmapFill(byteStream, true, true);
    case 0x41:
      return parseBitmapFill(byteStream, false, true);
    case 0x42:
      return parseBitmapFill(byteStream, true, false);
    case 0x43:
      return parseBitmapFill(byteStream, false, false);
    default:
      throw new Error(`Unexpected fill style code: ${code}`);
  }
}

export function parseBitmapFill(
  byteStream: ReadableByteStream,
  repeating: boolean,
  smoothed: boolean,
): fillStyles.Bitmap {
  const bitmapId: Uint16 = byteStream.readUint16LE();
  const matrix: Matrix = parseMatrix(byteStream);
  return {
    type: FillStyleType.Bitmap,
    bitmapId,
    matrix,
    repeating,
    smoothed,
  };
}

export function parseFocalGradientFill(byteStream: ReadableByteStream, withAlpha: boolean): fillStyles.FocalGradient {
  const matrix: Matrix = parseMatrix(byteStream);
  const gradient: Gradient = parseGradient(byteStream, withAlpha);
  const focalPoint: Sfixed8P8 = Sfixed8P8.fromEpsilons(byteStream.readSint16LE());
  return {
    type: FillStyleType.FocalGradient,
    matrix,
    gradient,
    focalPoint,
  };
}

export function parseLinearGradientFill(byteStream: ReadableByteStream, withAlpha: boolean): fillStyles.LinearGradient {
  const matrix: Matrix = parseMatrix(byteStream);
  const gradient: Gradient = parseGradient(byteStream, withAlpha);
  return {
    type: FillStyleType.LinearGradient,
    matrix,
    gradient,
  };
}

export function parseRadialGradientFill(byteStream: ReadableByteStream, withAlpha: boolean): fillStyles.RadialGradient {
  const matrix: Matrix = parseMatrix(byteStream);
  const gradient: Gradient = parseGradient(byteStream, withAlpha);
  return {
    type: FillStyleType.RadialGradient,
    matrix,
    gradient,
  };
}

export function parseSolidFill(byteStream: ReadableByteStream, withAlpha: boolean): fillStyles.Solid {
  let color: StraightSRgba8;
  if (withAlpha) {
    color = parseStraightSRgba8(byteStream);
  } else {
    color = {...parseSRgb8(byteStream), a: 0xff};
  }
  return {
    type: FillStyleType.Solid,
    color,
  };
}

export function parseLineStyleList(
  byteStream: ReadableByteStream,
  shapeVersion: ShapeVersion,
): LineStyle[] {
  const result: LineStyle[] = [];
  const len: UintSize = parseListLength(byteStream, shapeVersion >= ShapeVersion.Shape2);
  for (let i: UintSize = 0; i < len; i++) {
    if (shapeVersion >= ShapeVersion.Shape4) {
      result.push(parseLineStyle2(byteStream));
    } else {
      result.push(parseLineStyle(byteStream, shapeVersion >= ShapeVersion.Shape3));
    }
  }
  return result;
}

export function parseLineStyle(byteStream: ReadableByteStream, withAlpha: boolean): LineStyle {
  const width: Uint16 = byteStream.readUint16LE();
  const color: StraightSRgba8 = withAlpha ? parseStraightSRgba8(byteStream) : {...parseSRgb8(byteStream), a: 255};
  return {
    width,
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
    },
  };
}

export function parseLineStyle2(byteStream: ReadableByteStream): LineStyle {
  const width: Uint16 = byteStream.readUint16LE();

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
      throw new Incident("UnexpectedJoinStyleId", {id: joinStyleId});
  }

  let fill: FillStyle;
  if (hasFill) {
    fill = parseFillStyle(byteStream, true);
  } else {
    fill = {type: FillStyleType.Solid, color: parseStraightSRgba8(byteStream)};
  }

  return {
    width,
    fill,
    pixelHinting,
    noVScale,
    noHScale,
    noClose,
    join,
    startCap: capStyleFromId(startCapStyleId),
    endCap: capStyleFromId(endCapStyleId),
  };
}

export function capStyleFromId(capStyleId: Uint2): CapStyle {
  switch (capStyleId) {
    case 0:
      return CapStyle.Round;
    case 1:
      return CapStyle.None;
    case 2:
      return CapStyle.Square;
    default:
      throw new Incident("UnexpectedCapStyleId", {id: capStyleId});
  }
}
