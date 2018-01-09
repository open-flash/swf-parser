import { Incident } from "incident";
import { Float32, Sint16, Uint16, Uint32, Uint8, UintSize } from "semantic-types";
import {
  BlendMode,
  ClipActions,
  ColorTransformWithAlpha,
  Filter,
  Fixed8P8,
  Glyph,
  Label,
  LanguageCode,
  Matrix,
  NamedId,
  Rect,
  Scene,
  Shape,
  StraightSRgba8,
  Tag,
  tags,
  TagType,
  text,
} from "swf-tree";
import { MorphShape } from "swf-tree/morph-shape";
import { GlyphCountProvider, ParseContext } from "../parse-context";
import { ByteStream, Stream } from "../stream";
import { parseActionsString } from "./avm1";
import {
  parseColorTransform,
  parseColorTransformWithAlpha,
  parseMatrix,
  parseRect,
  parseSRgb8,
  parseStraightSRgba8,
} from "./basic-data-types";
import { parseBlendMode, parseClipActionsString, parseFilterList } from "./display";
import { MorphShapeVersion, parseMorphShape } from "./morph-shape";
import { parseShape, ShapeVersion } from "./shape";
import {
  parseCsmTableHintBits,
  parseFontAlignmentZone,
  parseFontLayout,
  parseGridFittingBits,
  parseLanguageCode,
  parseOffsetGlyphs,
  parseTextAlignment,
  parseTextRecordString,
  parseTextRendererBits,
} from "./text";

/**
 * Read tags until the end of the stream or "end-of-tags".
 */
export function parseTagBlockString(byteStream: Stream, context: ParseContext): Tag[] {
  const tags: Tag[] = [];
  while (byteStream.available() > 0) {
    // A null byte indicates the end-of-tags
    if (byteStream.peekUint8() === 0) {
      byteStream.skip(1);
      break;
    }
    tags.push(parseTag(byteStream, context));
  }
  return tags;
}

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
    case 4:
      return parsePlaceObject(byteStream);
    case 5:
      return parseRemoveObject(byteStream);
    case 9:
      return parseSetBackgroundColor(byteStream);
    case 11:
      return parseDefineText(byteStream);
    case 12:
      return parseDoAction(byteStream);
    case 22:
      return parseDefineShape2(byteStream);
    case 26: {
      const swfVersion: UintSize | undefined = context.getVersion();
      if (swfVersion === undefined) {
        throw new Incident("Missing SWF version, unable to parse placeObject2");
      }
      return parsePlaceObject2(byteStream, swfVersion);
    }
    case 28:
      return parseRemoveObject2(byteStream);
    case 32:
      return parseDefineShape3(byteStream);
    case 37:
      return parseDefineEditText(byteStream);
    case 39:
      return parseDefineSprite(byteStream, context);
    case 46:
      return parseDefineMorphShape(byteStream);
    case 56:
      return parseExportAssets(byteStream);
    case 57:
      return parseImportAssets(byteStream);
    case 59:
      return parseDoInitAction(byteStream);
    case 69:
      return parseFileAttributes(byteStream);
    case 70: {
      const swfVersion: UintSize | undefined = context.getVersion();
      if (swfVersion === undefined) {
        throw new Incident("Missing SWF version, unable to parse placeObject3");
      }
      return parsePlaceObject3(byteStream, swfVersion);
    }
    case 71:
      return parseImportAssets2(byteStream);
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
  const glyphs: Glyph[] = parseOffsetGlyphs(byteStream, glyphCount, useWideOffsets);
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

export function parseDefineMorphShape(byteStream: Stream): tags.DefineMorphShape {
  const id: Uint16 = byteStream.readUint16LE();
  const startBounds: Rect = parseRect(byteStream);
  const endBounds: Rect = parseRect(byteStream);
  const shape: MorphShape = parseMorphShape(byteStream, MorphShapeVersion.MorphShape1);

  return {
    type: TagType.DefineMorphShape,
    id,
    startBounds,
    endBounds,
    startEdgeBounds: undefined,
    endEdgeBounds: undefined,
    hasNonScalingStrokes: false,
    hasScalingStrokes: false,
    shape,
  };
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
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);
  const shape: Shape = parseShape(byteStream, version);

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

export function parseDefineEditText(byteStream: Stream): tags.DefineDynamicText {
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);

  const flags: Uint16 = byteStream.readUint16BE();
  const hasText: boolean = (flags & (1 << 15)) !== 0;
  const wordWrap: boolean = (flags & (1 << 14)) !== 0;
  const multiline: boolean = (flags & (1 << 13)) !== 0;
  const password: boolean = (flags & (1 << 12)) !== 0;
  const readonly: boolean = (flags & (1 << 11)) !== 0;
  const hasColor: boolean = (flags & (1 << 10)) !== 0;
  const hasMaxLength: boolean = (flags & (1 << 9)) !== 0;
  const hasFont: boolean = (flags & (1 << 8)) !== 0;
  const hasFontClass: boolean = (flags & (1 << 7)) !== 0;
  const autoSize: boolean = (flags & (1 << 6)) !== 0;
  const hasLayout: boolean = (flags & (1 << 5)) !== 0;
  const noSelect: boolean = (flags & (1 << 4)) !== 0;
  const border: boolean = (flags & (1 << 3)) !== 0;
  const wasStatic: boolean = (flags & (1 << 2)) !== 0;
  const html: boolean = (flags & (1 << 1)) !== 0;
  const useGlyphFont: boolean = (flags & (1 << 0)) !== 0;

  const fontId: Uint16 | undefined = hasFont ? byteStream.readUint16LE() : undefined;
  const fontClass: string | undefined = hasFontClass ? byteStream.readCString() : undefined;
  const fontSize: Uint16 | undefined = hasFont ? byteStream.readUint16LE() : undefined;
  const color: StraightSRgba8 | undefined = hasColor ? parseStraightSRgba8(byteStream) : undefined;
  const maxLength: UintSize | undefined = hasMaxLength ? byteStream.readUint16LE() : undefined;
  const align: text.TextAlignment | undefined = hasLayout ? parseTextAlignment(byteStream) : undefined;
  const marginLeft: Uint16 = hasLayout ? byteStream.readUint16LE() : 0;
  const marginRight: Uint16 = hasLayout ? byteStream.readUint16LE() : 0;
  const indent: Uint16 = hasLayout ? byteStream.readUint16LE() : 0;
  const leading: Sint16 = hasLayout ? byteStream.readSint16LE() : 0;
  const rawVariableName: string = byteStream.readCString();
  const variableName: string | undefined = rawVariableName.length > 0 ? rawVariableName : undefined;
  const text: string | undefined = hasText ? byteStream.readCString() : undefined;

  return {
    type: TagType.DefineDynamicText,
    id,
    bounds,
    wordWrap,
    multiline,
    password,
    readonly,
    autoSize,
    noSelect,
    border,
    wasStatic,
    html,
    useGlyphFont,
    fontId,
    fontClass,
    fontSize,
    color,
    maxLength,
    align,
    marginLeft,
    marginRight,
    indent,
    leading,
    variableName,
    text,
  };
}

export function parseDefineSprite(byteStream: Stream, context: ParseContext): tags.DefineSprite {
  const id: Uint16 = byteStream.readUint16LE();
  const frameCount: UintSize = byteStream.readUint16LE();
  const tags: Tag[] = parseTagBlockString(byteStream, context);
  return {
    type: TagType.DefineSprite,
    id,
    frameCount,
    tags,
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

export function parseDoInitAction(byteStream: Stream): tags.DoInitAction {
  const spriteId: Uint16 = byteStream.readUint16LE();
  return {type: TagType.DoInitAction, spriteId, actions: parseActionsString(byteStream)};
}

export function parseExportAssets(byteStream: Stream): tags.ExportAssets {
  const assetCount: UintSize = byteStream.readUint16LE();
  const assets: NamedId[] = [];
  for (let i: number = 0; i < assetCount; i++) {
    const id: Uint16 = byteStream.readUint16LE();
    const name: string = byteStream.readCString();
    assets.push({id, name});
  }
  return {
    type: TagType.ExportAssets,
    assets,
  };
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

export function parseImportAssets(byteStream: Stream): tags.ImportAssets {
  const url: string = byteStream.readCString();
  const assetCount: UintSize = byteStream.readUint16LE();
  const assets: NamedId[] = [];
  for (let i: number = 0; i < assetCount; i++) {
    const id: Uint16 = byteStream.readUint16LE();
    const name: string = byteStream.readCString();
    assets.push({id, name});
  }
  return {
    type: TagType.ImportAssets,
    url,
    assets,
  };
}

export function parseImportAssets2(byteStream: Stream): tags.ImportAssets {
  const url: string = byteStream.readCString();
  byteStream.skip(2);
  const assetCount: UintSize = byteStream.readUint16LE();
  const assets: NamedId[] = [];
  for (let i: number = 0; i < assetCount; i++) {
    const id: Uint16 = byteStream.readUint16LE();
    const name: string = byteStream.readCString();
    assets.push({id, name});
  }
  return {
    type: TagType.ImportAssets,
    url,
    assets,
  };
}

export function parseMetadata(byteStream: Stream): tags.Metadata {
  return {type: TagType.Metadata, metadata: byteStream.readCString()};
}

export function parsePlaceObject(byteStream: Stream): tags.PlaceObject {
  const characterId: Uint16 = byteStream.readUint16LE();
  const depth: Uint16 = byteStream.readUint16LE();
  const matrix: Matrix = parseMatrix(byteStream);
  let colorTransform: ColorTransformWithAlpha | undefined = undefined;
  if (byteStream.available() > 0) {
    colorTransform = {
      ...parseColorTransform(byteStream),
      alphaMult: Fixed8P8.fromValue(1),
      alphaAdd: 0,
    };
  }

  return {
    type: TagType.PlaceObject,
    isMove: false,
    depth,
    characterId,
    matrix,
    colorTransform,
    filters: undefined,
  };
}

export function parsePlaceObject2(byteStream: Stream, swfVersion: UintSize): tags.PlaceObject {
  const hasClipActions: boolean = byteStream.readBoolBits();
  const hasClipDepth: boolean = byteStream.readBoolBits();
  const hasName: boolean = byteStream.readBoolBits();
  const hasRatio: boolean = byteStream.readBoolBits();
  const hasColorTransform: boolean = byteStream.readBoolBits();
  const hasMatrix: boolean = byteStream.readBoolBits();
  const hasCharacterId: boolean = byteStream.readBoolBits();
  const isMove: boolean = byteStream.readBoolBits();
  const depth: Uint16 = byteStream.readUint16LE();
  const characterId: Uint16 | undefined = hasCharacterId ? byteStream.readUint16LE() : undefined;
  const matrix: Matrix | undefined = hasMatrix ? parseMatrix(byteStream) : undefined;
  const colorTransform: ColorTransformWithAlpha | undefined = hasColorTransform ?
    parseColorTransformWithAlpha(byteStream) :
    undefined;
  const ratio: Uint16 | undefined = hasRatio ? byteStream.readUint16LE() : undefined;
  const name: string | undefined = hasName ? byteStream.readCString() : undefined;
  const clipDepth: Uint16 | undefined = hasClipDepth ? byteStream.readUint16LE() : undefined;

  const clipActions: ClipActions[] | undefined = hasClipActions ?
    parseClipActionsString(byteStream, swfVersion >= 6) :
    undefined;

  return {
    type: TagType.PlaceObject,
    isMove,
    depth,
    characterId,
    matrix,
    colorTransform,
    ratio,
    name,
    clipDepth,
    filters: undefined,
    clipActions,
  };
}

export function parsePlaceObject3(byteStream: ByteStream, swfVersion: UintSize): tags.PlaceObject {
  const flags: Uint16 = byteStream.readUint16BE();
  const hasClipActions: boolean = (flags & (1 << 15)) !== 0;
  const hasClipDepth: boolean = (flags & (1 << 14)) !== 0;
  const hasName: boolean = (flags & (1 << 13)) !== 0;
  const hasRatio: boolean = (flags & (1 << 12)) !== 0;
  const hasColorTransform: boolean = (flags & (1 << 11)) !== 0;
  const hasMatrix: boolean = (flags & (1 << 10)) !== 0;
  const hasCharacterId: boolean = (flags & (1 << 9)) !== 0;
  const isMove: boolean = (flags & (1 << 8)) !== 0;
  // Reserved: (flags & (1 << 7))
  const hasBackgroundColor: boolean = (flags & (1 << 6)) !== 0;
  const hasVisibility: boolean = (flags & (1 << 5)) !== 0;
  const hasImage: boolean = (flags & (1 << 4)) !== 0;
  const hasClassName: boolean = (flags & (1 << 3)) !== 0;
  const hasCacheHint: boolean = (flags & (1 << 2)) !== 0;
  const hasBlendMode: boolean = (flags & (1 << 1)) !== 0;
  const hasFilters: boolean = (flags & (1 << 0)) !== 0;

  const depth: Uint16 = byteStream.readUint16LE();
  const className: string | undefined = hasClassName || (hasImage && hasCharacterId) ?
    byteStream.readCString() :
    undefined;
  const characterId: Uint16 | undefined = hasCharacterId ? byteStream.readUint16LE() : undefined;
  const matrix: Matrix | undefined = hasMatrix ? parseMatrix(byteStream) : undefined;
  const colorTransform: ColorTransformWithAlpha | undefined = hasColorTransform ?
    parseColorTransformWithAlpha(byteStream) :
    undefined;
  const ratio: Uint16 | undefined = hasRatio ? byteStream.readUint16LE() : undefined;
  const name: string | undefined = hasName ? byteStream.readCString() : undefined;
  const clipDepth: Uint16 | undefined = hasClipDepth ? byteStream.readUint16LE() : undefined;
  const filters: Filter[] = hasFilters ? parseFilterList(byteStream) : [];
  const blendMode: BlendMode = hasBlendMode ? parseBlendMode(byteStream) : BlendMode.Normal;
  const useBitmapCache: boolean = hasCacheHint ? byteStream.readUint8() !== 0 : false;
  const isVisible: boolean = hasVisibility ? byteStream.readUint8() !== 0 : false;
  // This does not match the spec, see Shumway
  // https://github.com/mozilla/shumway/blob/16451d8836fa85f4b16eeda8b4bda2fa9e2b22b0/src/swf/parser/module.ts#L158
  // TODO(demurgos): Check if it is RGBA or ARGB
  const backgroundColor: StraightSRgba8 | undefined = hasBackgroundColor ? parseStraightSRgba8(byteStream) : undefined;

  const clipActions: ClipActions[] | undefined = hasClipActions ?
    parseClipActionsString(byteStream, swfVersion >= 6) :
    undefined;

  return {
    type: TagType.PlaceObject,
    isMove,
    depth,
    characterId,
    matrix,
    colorTransform,
    ratio,
    name,
    className,
    clipDepth,
    filters,
    blendMode,
    bitmapCache: useBitmapCache,
    visible: isVisible,
    backgroundColor,
    clipActions,
  };
}

export function parseRemoveObject(byteStream: Stream): tags.RemoveObject {
  const characterId: Uint16 = byteStream.readUint16LE();
  const depth: Uint16 = byteStream.readUint16LE();
  return {type: TagType.RemoveObject, characterId, depth};
}

export function parseRemoveObject2(byteStream: Stream): tags.RemoveObject {
  const depth: Uint16 = byteStream.readUint16LE();
  return {type: TagType.RemoveObject, depth};
}

export function parseSetBackgroundColor(byteStream: Stream): tags.SetBackgroundColor {
  return {type: TagType.SetBackgroundColor, color: parseSRgb8(byteStream)};
}
