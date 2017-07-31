import {Incident} from "incident";
import {Float32, Uint16, Uint32, Uint8, UintSize} from "semantic-types";
import {
  ColorTransformWithAlpha,
  Label,
  LanguageCode,
  Matrix,
  Rect,
  Scene,
  shapes,
  Tag,
  tags,
  TagType,
  text,
} from "swf-tree";
import {GlyphCountProvider, ParseContext} from "../parse-context";
import {Stream} from "../stream";
import {parseActionsString} from "./avm1";
import {
  parseColorTransformWithAlpha,
  parseMatrix,
  parseRect,
  parseSRgb8,
} from "./basic-data-types";
import {parseShape, ShapeVersion} from "./shapes";
import {
  parseCsmTableHintBits,
  parseFontAlignmentZone,
  parseFontLayout,
  parseGridFittingBits,
  parseLanguageCode,
  parseOffsetGlyphs,
  parseTextRecordString,
  parseTextRendererBits,
} from "./text";

export function parseTag(byteStream: Stream, context: ParseContext): Tag {
  const {code, length}: TagHeader = parseTagHeader(byteStream);
  const tag: Tag = parseTagBody(byteStream.take(length), code, context);
  switch (tag.type) {
    case TagType.DefineFont:
      if (tag.glyphs !== undefined) {
        context.setGlyphCount(tag.id, tag.glyphs.length);
      } else {
        context.setGlyphCount(tag.id, 0);
      }
      break;
    default:
      break;
  }
  return tag;
}

interface TagHeader {
  code: Uint16;
  length: Uint32;
}

function parseTagHeader(byteStream: Stream): TagHeader {
  const codeAndLength: Uint16 = byteStream.readUint16LE();
  const code: Uint16 = codeAndLength >>> 6;
  const maxLength: number = (1 << 6) - 1;
  const length: number = codeAndLength & maxLength;

  if (length === maxLength) {
    return {code, length: byteStream.readUint32LE()};
  } else {
    return {code, length};
  }
}

function parseTagBody(byteStream: Stream, tagCode: Uint8, context: ParseContext): Tag {
  switch (tagCode) {
    case 1:
      return {type: TagType.ShowFrame};
    case 2:
      return parseDefineShape(byteStream);
    case 9:
      return parseSetBackgroundColor(byteStream);
    case 11:
      return parseDefineText(byteStream);
    case 12:
      return parseDoAction(byteStream);
    case 22:
      return parseDefineShape2(byteStream);
    case 26:
      return parsePlaceObject2(byteStream);
    case 32:
      return parseDefineShape3(byteStream);
    case 69:
      return parseFileAttributes(byteStream);
    case 73:
      return parseDefineFontAlignZones(byteStream, context.getGlyphCount.bind(context));
    case 74:
      return parseCsmTextSettings(byteStream);
    case 75:
      return parseDefineFont(byteStream);
    case 77:
      return parseMetadata(byteStream);
    case 86:
      return parseDefineSceneAndFrameLabelData(byteStream);
    case 88:
      return parseDefineFontName(byteStream);
    default:
      return {type: TagType.Unknown, code: tagCode, data: Uint8Array.from(byteStream.bytes)};
  }
}

export function parseCsmTextSettings(byteStream: Stream): tags.CsmTextSettings {
  const textId: Uint16 = byteStream.readUint16LE();
  const renderer: text.TextRenderer = parseTextRendererBits(byteStream);
  const fitting: text.GridFitting = parseGridFittingBits(byteStream);
  byteStream.skipBits(3);
  const thickness: Float32 = byteStream.readFloat32BE();
  const sharpness: Float32 = byteStream.readFloat32BE();
  byteStream.skip(1);
  return {type: TagType.CsmTextSettings, textId, renderer, fitting, thickness, sharpness};
}

export function parseDefineFont(byteStream: Stream): tags.DefineFont {
  const id: Uint16 = byteStream.readUint16LE();
  const hasLayout: boolean = byteStream.readBoolBits();
  const isShiftJis: boolean = byteStream.readBoolBits();
  const isAnsi: boolean = byteStream.readBoolBits();
  const isSmall: boolean = byteStream.readBoolBits();
  const useWideOffsets: boolean = byteStream.readBoolBits();
  const useWideCodes: boolean = byteStream.readBoolBits();
  const isItalic: boolean = byteStream.readBoolBits();
  const isBold: boolean = byteStream.readBoolBits();
  const language: LanguageCode = parseLanguageCode(byteStream);
  const fontNameLength: UintSize = byteStream.readUint8();
  const fontName: string = byteStream.take(fontNameLength).readCString();
  const glyphCount: UintSize = byteStream.readUint16LE();
  if (glyphCount === 0) {
    // System font
    return {
      type: TagType.DefineFont,
      id,
      fontName,
      isSmall,
      isShiftJis,
      isAnsi,
      isItalic,
      isBold,
      language,
    };
  }
  const glyphs: shapes.Glyph[] = parseOffsetGlyphs(byteStream, glyphCount, useWideOffsets);
  const codeUnits: Uint16[] = new Array(glyphCount);
  for (let i: number = 0; i < codeUnits.length; i++) {
    codeUnits[i] = useWideCodes ? byteStream.readUint16LE() : byteStream.readUint8();
  }
  const layout: text.FontLayout | undefined = hasLayout ? parseFontLayout(byteStream, glyphCount) : undefined;

  return {
    type: TagType.DefineFont,
    id,
    fontName,
    isSmall,
    isShiftJis,
    isAnsi,
    isItalic,
    isBold,
    language,
    glyphs,
    codeUnits,
    layout,
  };
}

export function parseDefineFontAlignZones(
  byteStream: Stream,
  glyphCountProvider: GlyphCountProvider,
): tags.DefineFontAlignZones {
  const fontId: Uint16 = byteStream.readUint16LE();
  const glyphCount: UintSize | undefined = glyphCountProvider(fontId);
  if (glyphCount === undefined) {
    throw new Incident("ParseError", `ParseDefineFontAlignZones: Unknown font for id: ${fontId}`);
  }
  const csmTableHint: text.CsmTableHint = parseCsmTableHintBits(byteStream);
  byteStream.skipBits(6);
  const zones: text.FontAlignmentZone[] = [];
  for (let i: number = 0; i < glyphCount; i++) {
    zones.push(parseFontAlignmentZone(byteStream));
  }
  return {type: TagType.DefineFontAlignZones, fontId, csmTableHint, zones};
}

export function parseDefineFontName(byteStream: Stream): tags.DefineFontName {
  const fontId: Uint16 = byteStream.readUint16LE();
  const name: string = byteStream.readCString();
  const copyright: string = byteStream.readCString();
  return {type: TagType.DefineFontName, fontId, name, copyright};
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
  return parseDefineShapeAny(byteStream, ShapeVersion.Shape1);
}

export function parseDefineShape2(byteStream: Stream): tags.DefineShape {
  return parseDefineShapeAny(byteStream, ShapeVersion.Shape2);
}

export function parseDefineShape3(byteStream: Stream): tags.DefineShape {
  return parseDefineShapeAny(byteStream, ShapeVersion.Shape3);
}

function parseDefineShapeAny(byteStream: Stream, version: ShapeVersion): tags.DefineShape {
  // defineShape{1,2,3} are very similar, but we should check the special cases where they differ
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);
  const shape: shapes.Shape = parseShape(byteStream, version);

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

export function parseDefineText(byteStream: Stream): tags.DefineText {
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);
  const matrix: Matrix = parseMatrix(byteStream);
  const indexBits: UintSize = byteStream.readUint8();
  const advanceBits: UintSize = byteStream.readUint8();
  const records: text.TextRecord[] = parseTextRecordString(byteStream, false, indexBits, advanceBits);
  return {type: TagType.DefineText, id, bounds, matrix, records};
}

export function parseDefineText2(byteStream: Stream): tags.DefineText {
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);
  const matrix: Matrix = parseMatrix(byteStream);
  const indexBits: UintSize = byteStream.readUint8();
  const advanceBits: UintSize = byteStream.readUint8();
  const records: text.TextRecord[] = parseTextRecordString(byteStream, true, indexBits, advanceBits);
  return {type: TagType.DefineText, id, bounds, matrix, records};
}

export function parseDoAction(byteStream: Stream): tags.DoAction {
  return {type: TagType.DoAction, actions: parseActionsString(byteStream)};
}

export function parseFileAttributes(byteStream: Stream): tags.FileAttributes {
  const flags: Uint8 = byteStream.readUint8();
  byteStream.skip(3);

  return {
    type: TagType.FileAttributes,
    useDirectBlit: (flags & (1 << 6)) !== 0,
    useGpu: (flags & (1 << 5)) !== 0,
    hasMetadata: (flags & (1 << 4)) !== 0,
    useAs3: (flags & (1 << 3)) !== 0,
    noCrossDomainCaching: (flags & (1 << 2)) !== 0,
    useRelativeUrls: (flags & (1 << 1)) !== 0,
    useNetwork: (flags & (1 << 0)) !== 0,
  };
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

export function parseSetBackgroundColor(byteStream: Stream): tags.SetBackgroundColor {
  return {type: TagType.SetBackgroundColor, color: parseSRgb8(byteStream)};
}
