import {Sint32, Uint16, UintSize} from "semantic-types";
import {shapes, SRgb8, Vector2D} from "swf-tree";
import {BitStream, ByteStream} from "../stream";
import {parseSRgb8} from "./basic-data-types";

export function parseGlyph(byteStream: ByteStream): shapes.Glyph {
  const bitStream: BitStream = byteStream.asBitStream();
  const result: shapes.Glyph = parseGlyphBits(bitStream);
  bitStream.align();
  return result;
}

export function parseGlyphBits(bitStream: BitStream): shapes.Glyph {
  const fillBits: UintSize = bitStream.readUint32Bits(4);
  const lineBits: UintSize = bitStream.readUint32Bits(4);
  const records: shapes.ShapeRecord[] = parseShapeRecordStringBits(bitStream, fillBits, lineBits);
  return {records};
}

export function parseShape(byteStream: ByteStream): shapes.Shape {
  const bitStream: BitStream = byteStream.asBitStream();
  const result: shapes.Shape = parseShapeBits(bitStream);
  bitStream.align();
  return result;
}

export function parseShapeBits(bitStream: BitStream): shapes.Shape {
  const styles: ShapeStyles = parseShapeStylesBits(bitStream);
  const records: shapes.ShapeRecord[] = parseShapeRecordStringBits(bitStream, styles.fillBits, styles.lineBits);
  return {
    fillStyles: styles.fill,
    lineStyles: styles.line,
    records,
  };
}

export interface ShapeStyles {
  fill: shapes.FillStyle[];
  line: shapes.LineStyle[];
  fillBits: UintSize;
  lineBits: UintSize;
}

export function parseShapeStylesBits(bitStream: BitStream): ShapeStyles {
  const byteStream: ByteStream = bitStream.asByteStream();
  const fill: shapes.FillStyle[] = parseFillStyleList(byteStream);
  const line: shapes.LineStyle[] = parseLineStyleList(byteStream);
  bitStream = byteStream.asBitStream();
  const fillBits: UintSize = bitStream.readUint32Bits(4);
  const lineBits: UintSize = bitStream.readUint32Bits(4);
  return {fill, line, fillBits, lineBits};
}

export function parseShapeRecordStringBits(
  bitStream: BitStream,
  fillBits: UintSize,
  lineBits: UintSize,
): shapes.ShapeRecord[] {
  const result: shapes.ShapeRecord[] = [];

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
      const styles: shapes.records.StyleChange = parseStyleChangeBits(bitStream, fillBits, lineBits);
      result.push(styles);
    }
  }

  return result;
}

export function parseCurvedEdgeBits(bitStream: BitStream): shapes.records.CurvedEdge {
  const nBits: UintSize = bitStream.readUint16Bits(4) + 2;
  const controlX: Sint32 = bitStream.readSint32Bits(nBits);
  const controlY: Sint32 = bitStream.readSint32Bits(nBits);
  const deltaX: Sint32 = bitStream.readSint32Bits(nBits);
  const deltaY: Sint32 = bitStream.readSint32Bits(nBits);
  return {
    type: shapes.ShapeRecordType.CurvedEdge,
    controlDelta: {x: controlX, y: controlY},
    endDelta: {x: deltaX, y: deltaY},
  };
}

export function parseStraightEdgeBits(bitStream: BitStream): shapes.records.StraightEdge {
  const nBits: UintSize = bitStream.readUint16Bits(4) + 2;
  const isDiagonal: boolean = bitStream.readBoolBits();
  const isVertical: boolean = !isDiagonal && bitStream.readBoolBits();
  const deltaX: Sint32 = isDiagonal || !isVertical ? bitStream.readSint32Bits(nBits) : 0;
  const deltaY: Sint32 = isDiagonal || isVertical ? bitStream.readSint32Bits(nBits) : 0;
  return {
    type: shapes.ShapeRecordType.StraightEdge,
    endDelta: {x: deltaX, y: deltaY},
  };
}

export function parseStyleChangeBits(
  bitStream: BitStream,
  fillStyleBits: UintSize,
  lineStyleBits: UintSize,
): shapes.records.StyleChange {
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
  const leftFill: UintSize | undefined = changeLeftFill ? bitStream.readUint16Bits(fillStyleBits) : undefined;
  const rightFill: UintSize | undefined = changeRightFill ? bitStream.readUint16Bits(fillStyleBits) : undefined;
  const lineStyle: UintSize | undefined = changeLineStyle ? bitStream.readUint16Bits(lineStyleBits) : undefined;

  return {
    type: shapes.ShapeRecordType.StyleChange,
    moveTo,
    leftFill,
    rightFill,
    lineStyle,
    fillStyles: undefined,
    lineStyles: undefined,
  };
}

export function parseListLength(byteStream: ByteStream): UintSize {
  const len: UintSize = byteStream.readUint8();
  return len < 0xff ? len : byteStream.readUint16LE();
}

export function parseSolidFill(byteStream: ByteStream): shapes.fills.Solid {
  const color: SRgb8 = parseSRgb8(byteStream);
  return {
    type: shapes.FillStyleType.Solid,
    color: {...color, a: 255},
  };
}

export function parseFillStyle(byteStream: ByteStream): shapes.FillStyle {
  switch (byteStream.readUint8()) {
    case 0:
      return parseSolidFill(byteStream);
    default:
      throw new Error("Unexpected fill style");
  }
}

export function parseFillStyleList(byteStream: ByteStream): shapes.FillStyle[] {
  const result: shapes.FillStyle[] = [];
  const len: UintSize = parseListLength(byteStream);
  for (let i: UintSize = 0; i < len; i++) {
    result.push(parseFillStyle(byteStream));
  }
  return result;
}

export function parseLineStyle(byteStream: ByteStream): shapes.LineStyle {
  const width: Uint16 = byteStream.readUint16LE();
  const color: SRgb8 = parseSRgb8(byteStream);
  return {
    width,
    startCap: shapes.CapStyle.Round,
    endCap: shapes.CapStyle.Round,
    join: {type: shapes.JoinStyleType.Round},
    noHScale: false,
    noVScale: false,
    noClose: false,
    pixelHinting: false,
    fill: {
      type: shapes.FillStyleType.Solid,
      color: {...color, a: 255},
    },
  };
}

export function parseLineStyleList(byteStream: ByteStream): shapes.LineStyle[] {
  const result: shapes.LineStyle[] = [];
  const len: UintSize = parseListLength(byteStream);
  for (let i: UintSize = 0; i < len; i++) {
    result.push(parseLineStyle(byteStream));
  }
  return result;
}
