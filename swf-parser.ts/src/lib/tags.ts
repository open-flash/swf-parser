import {Incident} from "incident";
import {Sint32, Uint16, Uint32, Uint8, UintSize} from "semantic-types";
import {
  ColorTransformWithAlpha,
  Label,
  Matrix,
  Rect,
  Scene,
  shapes,
  SRgb8,
  Tag,
  tags,
  TagType,
  Vector2D,
} from "swf-tree";
import {parseActionsString} from "./parsers/avm1";
import {
  parseColorTransformWithAlpha,
  parseMatrix,
  parseRect,
  parseRgb,
} from "./parsers/basic-data-types";
import {Stream} from "./stream";

interface SwfTagHeader {
  tagCode: Uint16;
  length: Uint32;
}

function parseSwfTagHeader(byteStream: Stream): SwfTagHeader {
  const codeAndLength: Uint16 = byteStream.readUint16LE();
  const tagCode: Uint16 = codeAndLength >> 6;
  const maxLength: number = (1 << 6) - 1;
  const length: number = codeAndLength & maxLength;

  if (length === maxLength) {
    return {tagCode, length: byteStream.readUint32LE()};
  } else {
    return {tagCode, length};
  }
}

function parseListLength(byteStream: Stream): UintSize {
  const len: UintSize = byteStream.readUint8();
  return len < 0xff ? len : byteStream.readUint16LE();
}

function parseSolidFill(byteStream: Stream): shapes.fills.Solid {
  const color: SRgb8 = parseRgb(byteStream);
  return {
    type: shapes.FillStyleType.Solid,
    color: {...color, a: 255},
  };
}

function parseFillStyle(byteStream: Stream): shapes.FillStyle {
  switch (byteStream.readUint8()) {
    case 0:
      return parseSolidFill(byteStream);
    default:
      throw new Error("Unexpected fill style");
  }
}

function parseFillStyleList(byteStream: Stream): shapes.FillStyle[] {
  const result: shapes.FillStyle[] = [];
  const len: UintSize = parseListLength(byteStream);
  for (let i: UintSize = 0; i < len; i++) {
    result.push(parseFillStyle(byteStream));
  }
  return result;
}

function parseLineStyle(byteStream: Stream): shapes.LineStyle {
  const width: Uint16 = byteStream.readUint16LE();
  const color: SRgb8 = parseRgb(byteStream);
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

function parseLineStyleList(byteStream: Stream): shapes.LineStyle[] {
  const result: shapes.LineStyle[] = [];
  const len: UintSize = parseListLength(byteStream);
  for (let i: UintSize = 0; i < len; i++) {
    result.push(parseLineStyle(byteStream));
  }
  return result;
}

function parseCurvedEdgeBits(bitStream: Stream): shapes.records.CurvedEdge {
  bitStream.skipBits(2);
  const nBits: UintSize = bitStream.readUint16Bits(4) + 2;
  const controlX: Sint32 = bitStream.readInt32Bits(nBits);
  const controlY: Sint32 = bitStream.readInt32Bits(nBits);
  const deltaX: Sint32 = bitStream.readInt32Bits(nBits);
  const deltaY: Sint32 = bitStream.readInt32Bits(nBits);
  return {
    type: shapes.ShapeRecordType.CurvedEdge,
    controlDelta: {x: controlX, y: controlY},
    endDelta: {x: deltaX, y: deltaY},
  };
}

function parseStraightEdgeBits(bitStream: Stream): shapes.records.StraightEdge {
  bitStream.skipBits(2);
  const nBits: UintSize = bitStream.readUint16Bits(4) + 2;
  const isDiagonal: boolean = bitStream.readBoolBits();
  const isVertical: boolean = !isDiagonal && bitStream.readBoolBits();
  const deltaX: Sint32 = isDiagonal || !isVertical ? bitStream.readInt32Bits(nBits) : 0;
  const deltaY: Sint32 = isDiagonal || isVertical ? bitStream.readInt32Bits(nBits) : 0;
  return {
    type: shapes.ShapeRecordType.StraightEdge,
    endDelta: {x: deltaX, y: deltaY},
  };
}

function parseStyleChangeBits(
  bitStream: Stream,
  fillStyleBits: UintSize,
  lineStyleBits: UintSize,
): shapes.records.StyleChange {
  bitStream.skipBits(1);
  const hasNewStyles: boolean = bitStream.readBoolBits();
  const changeLineStyle: boolean = bitStream.readBoolBits();
  const changeRightFill: boolean = bitStream.readBoolBits();
  const changeLeftFill: boolean = bitStream.readBoolBits();
  const hasMoveTo: boolean = bitStream.readBoolBits();

  let moveTo: Vector2D | undefined = undefined;
  if (hasMoveTo) {
    const nBits: UintSize = bitStream.readUint16Bits(5);
    const x: Sint32 = bitStream.readInt32Bits(nBits);
    const y: Sint32 = bitStream.readInt32Bits(nBits);
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

function parseShapeRecordListBits(bitStream: Stream): shapes.ShapeRecord[] {
  const result: shapes.ShapeRecord[] = [];

  let fillStyleBits: UintSize;
  let lineStyleBits: UintSize;

  fillStyleBits = bitStream.readUint16Bits(4);
  lineStyleBits = bitStream.readUint16Bits(4);

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
    bitStream.bytePos = bytePos;
    bitStream.bitPos = bitPos;

    if (isEdge) {
      const isStraightEdge: boolean = bitStream.readBoolBits();
      bitStream.bytePos = bytePos;
      bitStream.bitPos = bitPos;
      if (isStraightEdge) {
        result.push(parseStraightEdgeBits(bitStream));
      } else {
        result.push(parseCurvedEdgeBits(bitStream));
      }
    } else {
      result.push(parseStyleChangeBits(bitStream, fillStyleBits, lineStyleBits));
    }
  }

  return result;
}

function parseShape(byteStream: Stream): shapes.Shape {
  const fillStyles: shapes.FillStyle[] = parseFillStyleList(byteStream);
  const lineStyles: shapes.LineStyle[] = parseLineStyleList(byteStream);
  const records: shapes.ShapeRecord[] = parseShapeRecordListBits(byteStream);
  byteStream.align();
  return {
    fillStyles,
    lineStyles,
    records,
  };
}

export function parseSwfTag(byteStream: Stream): Tag {
  const {tagCode, length}: SwfTagHeader = parseSwfTagHeader(byteStream);
  const swfTagStream: Stream = byteStream.take(length);

  switch (tagCode) {
    case 0:
      throw new Incident("EndOfTags", "Reached end of tags");
    case 1:
      return {type: TagType.ShowFrame};
    case 2:
      return parseDefineShape(swfTagStream);
    case 9:
      return parseSetBackgroundColor(swfTagStream);
    case 12:
      return parseDoAction(swfTagStream);
    case 26:
      return parsePlaceObject2(swfTagStream);
    case 69:
      return parseFileAttributes(swfTagStream);
    case 77:
      return parseMetadata(swfTagStream);
    case 86:
      return parseDefineSceneAndFrameLabelData(swfTagStream);
    default:
      return {type: TagType.Unknown, code: tagCode, data: Uint8Array.from(swfTagStream.bytes)};
  }
}

export function parseDefineSceneAndFrameLabelData(byteStream: Stream): tags.DefineSceneAndFrameLabelData {
  const sceneCount: Uint32 = byteStream.readEncodedUint32LE();
  const scenes: Scene[] = [];
  for (let i: number = 0; i < sceneCount; i++) {
    const offset: number = byteStream.readEncodedUint32LE();
    const name: string = byteStream.readCString();
    scenes.push({offset, name});
  }
  const labelCount: Uint32 = byteStream.readEncodedUint32LE();
  const labels: Label[] = [];
  for (let i: number = 0; i < labelCount; i++) {
    const frame: number = byteStream.readEncodedUint32LE();
    const name: string = byteStream.readCString();
    labels.push({frame, name});
  }

  return {
    type: TagType.DefineSceneAndFrameLabelData,
    scenes,
    labels,
  };
}

export function parseDefineShape(byteStream: Stream): tags.DefineShape {
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);
  const shape: shapes.Shape = parseShape(byteStream);

  return {
    type: TagType.DefineShape,
    id,
    bounds,
    edgeBounds: undefined,
    hasFillWinding: false,
    hasNonScalingStrokes: false,
    hasScalingStrokes: false,
    shape,
  };
}

export function parseDoAction(byteStream: Stream): tags.DoAction {
  return {type: TagType.DoAction, actions: parseActionsString(byteStream)};
}

export function parseFileAttributes(byteStream: Stream): tags.FileAttributes {
  const flags: Uint8 = byteStream.readUint8();
  byteStream.skip(3);

  return {
    type: TagType.FileAttributes,
    useDirectBlit: ((flags >> 6) & 1) > 0,
    useGpu: ((flags >> 5) & 1) > 0,
    hasMetadata: ((flags >> 4) & 1) > 0,
    useAs3: ((flags >> 3) & 1) > 0,
    noCrossDomainCaching: ((flags >> 2) & 1) > 0,
    useRelativeUrls: ((flags >> 1) & 1) > 0,
    useNetwork: ((flags >> 0) & 1) > 0,
  };
}

export function parseSetBackgroundColor(byteStream: Stream): tags.SetBackgroundColor {
  return {type: TagType.SetBackgroundColor, color: parseRgb(byteStream)};
}

export function parseMetadata(byteStream: Stream): tags.Metadata {
  return {type: TagType.Metadata, metadata: byteStream.readCString()};
}

export function parsePlaceObject2(byteStream: Stream): tags.PlaceObject {
  const hasClipActions: boolean = byteStream.readBoolBits();
  const hasClipDepth: boolean = byteStream.readBoolBits();
  const hasName: boolean = byteStream.readBoolBits();
  const hasRatio: boolean = byteStream.readBoolBits();
  const hasColorTransform: boolean = byteStream.readBoolBits();
  const hasMatrix: boolean = byteStream.readBoolBits();
  const hasCharacter: boolean = byteStream.readBoolBits();
  const isMove: boolean = byteStream.readBoolBits();
  const depth: Uint16 = byteStream.readUint16LE();
  const characterId: Uint16 | undefined = hasCharacter ? byteStream.readUint16LE() : undefined;
  const matrix: Matrix | undefined = hasMatrix ? parseMatrix(byteStream) : undefined;
  const colorTransform: ColorTransformWithAlpha | undefined = hasColorTransform ?
    parseColorTransformWithAlpha(byteStream) :
    undefined;
  const ratio: Uint16 | undefined = hasRatio ? byteStream.readUint16LE() : undefined;
  const name: string | undefined = hasName ? byteStream.readCString() : undefined;
  const clipDepth: Uint16 | undefined = hasClipDepth ? byteStream.readUint16LE() : undefined;

  return {
    type: TagType.PlaceObject,
    depth,
    characterId,
    matrix,
    colorTransform,
    ratio,
    name,
    className: undefined,
    clipDepth,
    filters: [],
    blendMode: undefined,
    bitmapCache: undefined,
    visible: undefined,
    backgroundColor: undefined,
    clipActions: [],
  };
}
