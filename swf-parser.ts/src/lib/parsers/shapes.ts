import {Sint32, Uint16, UintSize} from "semantic-types";
import {
  CapStyle, FillStyle, fillStyles, FillStyleType, Fixed8P8, Glyph, Gradient, JoinStyleType, LineStyle, Matrix, Shape,
  ShapeRecord,
  shapeRecords, ShapeRecordType, SRgb8, StraightSRgba8, Vector2D,
} from "swf-tree";
import {BitStream, ByteStream} from "../stream";
import {parseMatrix, parseSRgb8, parseStraightSRgba8} from "./basic-data-types";
import {parseGradient} from "./gradient";

export enum ShapeVersion {
  Shape1,
  Shape2,
  Shape3,
}

export function parseGlyph(byteStream: ByteStream): Glyph {
  const bitStream: BitStream = byteStream.asBitStream();
  const result: Glyph = parseGlyphBits(bitStream);
  bitStream.align();
  return result;
}

export function parseGlyphBits(bitStream: BitStream): Glyph {
  const fillBits: UintSize = bitStream.readUint32Bits(4);
  const lineBits: UintSize = bitStream.readUint32Bits(4);
  const records: ShapeRecord[] = parseShapeRecordStringBits(bitStream, fillBits, lineBits, ShapeVersion.Shape1);
  return {records};
}

export function parseShape(byteStream: ByteStream, version: ShapeVersion): Shape {
  const bitStream: BitStream = byteStream.asBitStream();
  const result: Shape = parseShapeBits(bitStream, version);
  bitStream.align();
  return result;
}

export function parseShapeBits(bitStream: BitStream, version: ShapeVersion): Shape {
  const styles: ShapeStyles = parseShapeStylesBits(bitStream, version);
  const records: ShapeRecord[] = parseShapeRecordStringBits(
    bitStream,
    styles.fillBits,
    styles.lineBits,
    version,
  );
  return {
    fillStyles: styles.fill,
    lineStyles: styles.line,
    records,
  };
}

export interface ShapeStyles {
  fill: FillStyle[];
  line: LineStyle[];
  fillBits: UintSize;
  lineBits: UintSize;
}

export function parseShapeStylesBits(bitStream: BitStream, version: ShapeVersion): ShapeStyles {
  const byteStream: ByteStream = bitStream.asByteStream();
  const fill: FillStyle[] = parseFillStyleList(byteStream, version);
  const line: LineStyle[] = parseLineStyleList(byteStream, version);
  bitStream = byteStream.asBitStream();
  const fillBits: UintSize = bitStream.readUint32Bits(4);
  const lineBits: UintSize = bitStream.readUint32Bits(4);
  return {fill, line, fillBits, lineBits};
}

export function parseShapeRecordStringBits(
  bitStream: BitStream,
  fillBits: UintSize,
  lineBits: UintSize,
  version: ShapeVersion,
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
      [styles, [fillBits, lineBits]] = parseStyleChangeBits(bitStream, fillBits, lineBits, version);
      result.push(styles);
    }
  }

  return result;
}

export function parseCurvedEdgeBits(bitStream: BitStream): shapeRecords.CurvedEdge {
  const nBits: UintSize = bitStream.readUint16Bits(4) + 2;
  const controlX: Sint32 = bitStream.readSint32Bits(nBits);
  const controlY: Sint32 = bitStream.readSint32Bits(nBits);
  const deltaX: Sint32 = bitStream.readSint32Bits(nBits);
  const deltaY: Sint32 = bitStream.readSint32Bits(nBits);
  return {
    type: ShapeRecordType.CurvedEdge,
    controlDelta: {x: controlX, y: controlY},
    endDelta: {x: deltaX, y: deltaY},
  };
}

export function parseStraightEdgeBits(bitStream: BitStream): shapeRecords.StraightEdge {
  const nBits: UintSize = bitStream.readUint16Bits(4) + 2;
  const isDiagonal: boolean = bitStream.readBoolBits();
  const isVertical: boolean = !isDiagonal && bitStream.readBoolBits();
  const deltaX: Sint32 = isDiagonal || !isVertical ? bitStream.readSint32Bits(nBits) : 0;
  const deltaY: Sint32 = isDiagonal || isVertical ? bitStream.readSint32Bits(nBits) : 0;
  return {
    type: ShapeRecordType.StraightEdge,
    endDelta: {x: deltaX, y: deltaY},
  };
}

export function parseStyleChangeBits(
  bitStream: BitStream,
  fillBits: UintSize,
  lineBits: UintSize,
  version: ShapeVersion,
): [shapeRecords.StyleChange, [UintSize, UintSize]] {
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

  let fillStyles: FillStyle[] | undefined = undefined;
  let lineStyles: LineStyle[] | undefined = undefined;
  if (hasNewStyles) {
    const styles: ShapeStyles = parseShapeStylesBits(bitStream, version);
    fillStyles = styles.fill;
    lineStyles = styles.line;
    fillBits = styles.fillBits;
    lineBits = styles.lineBits;
  }

  const styleChangeRecord: shapeRecords.StyleChange = {
    type: ShapeRecordType.StyleChange,
    moveTo,
    leftFill,
    rightFill,
    lineStyle,
    fillStyles,
    lineStyles,
  };

  return [styleChangeRecord, [fillBits, lineBits]];
}

/**
 * Parse a fill style list length or line style list length.
 *
 * @param byteStream Stream to use to parse this list length. Will mutate its state.
 * @param allowExtended Allow extended size (`> 255`). Here are the recommended values:
 *                      - `true` for `DefineShape2`, `DefineShape3`
 *                      - `false` for `DefineShape`
 * @returns List length
 */
export function parseListLength(byteStream: ByteStream, allowExtended: boolean): UintSize {
  const len: UintSize = byteStream.readUint8();
  if (len === 0xff && allowExtended) {
    return byteStream.readUint16LE();
  } else {
    return len;
  }
}

export function parseFillStyle(byteStream: ByteStream, withAlpha: boolean): FillStyle {
  switch (byteStream.readUint8()) {
    case 0x00:
      return parseSolidFill(byteStream, withAlpha);
    case 0x10:
      return parseLinearGradientFill(byteStream, withAlpha);
    case 0x12:
      return parseRadialGradientFill(byteStream, withAlpha);
    case 0x13:
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
      throw new Error("Unexpected fill style");
  }
}

export function parseBitmapFill(byteStream: ByteStream, repeating: boolean, smoothed: boolean): fillStyles.Bitmap {
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

export function parseFocalGradientFill(byteStream: ByteStream, withAlpha: boolean): fillStyles.FocalGradient {
  const matrix: Matrix = parseMatrix(byteStream);
  const gradient: Gradient = parseGradient(byteStream, withAlpha);
  const focalPoint: Fixed8P8 = byteStream.readFixed8P8LE();
  return {
    type: FillStyleType.FocalGradient,
    matrix,
    gradient,
    focalPoint,
  };
}

export function parseLinearGradientFill(byteStream: ByteStream, withAlpha: boolean): fillStyles.LinearGradient {
  const matrix: Matrix = parseMatrix(byteStream);
  const gradient: Gradient = parseGradient(byteStream, withAlpha);
  const focalPoint: Fixed8P8 = byteStream.readFixed8P8LE();
  return {
    type: FillStyleType.LinearGradient,
    matrix,
    gradient,
  };
}

export function parseRadialGradientFill(byteStream: ByteStream, withAlpha: boolean): fillStyles.RadialGradient {
  const matrix: Matrix = parseMatrix(byteStream);
  const gradient: Gradient = parseGradient(byteStream, withAlpha);
  const focalPoint: Fixed8P8 = byteStream.readFixed8P8LE();
  return {
    type: FillStyleType.RadialGradient,
    matrix,
    gradient,
  };
}

export function parseSolidFill(byteStream: ByteStream, withAlpha: boolean): fillStyles.Solid {
  let color: StraightSRgba8;
  if (withAlpha) {
    color = parseStraightSRgba8(byteStream);
  } else {
    color = {...parseSRgb8(byteStream), a: 255};
  }
  return {
    type: FillStyleType.Solid,
    color,
  };
}

export function parseFillStyleList(
  byteStream: ByteStream,
  version: ShapeVersion,
): FillStyle[] {
  const result: FillStyle[] = [];
  const len: UintSize = parseListLength(byteStream, version !== ShapeVersion.Shape1);
  for (let i: UintSize = 0; i < len; i++) {
    result.push(parseFillStyle(byteStream, version === ShapeVersion.Shape3));
  }
  return result;
}

export function parseLineStyle(byteStream: ByteStream): LineStyle {
  const width: Uint16 = byteStream.readUint16LE();
  const color: SRgb8 = parseSRgb8(byteStream);
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
      color: {...color, a: 255},
    },
  };
}

export function parseLineStyleList(
  byteStream: ByteStream,
  version: ShapeVersion,
): LineStyle[] {
  const result: LineStyle[] = [];
  const len: UintSize = parseListLength(byteStream, version !== ShapeVersion.Shape1);
  for (let i: UintSize = 0; i < len; i++) {
    result.push(parseLineStyle(byteStream));
  }
  return result;
}
