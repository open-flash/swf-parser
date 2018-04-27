import { Incident } from "incident";
import { Float32, Sint16, Uint16, Uint32, Uint8, UintSize } from "semantic-types";
import {
  BlendMode,
  ClipActions,
  ColorTransformWithAlpha,
  Filter,
  Sfixed8P8,
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
import { ButtonCondAction } from "swf-tree/buttons/button-cond-action";
import { ButtonRecord } from "swf-tree/buttons/button-record";
import { ImageType } from "swf-tree/image-type";
import { MorphShape } from "swf-tree/morph-shape";
import { SpriteTag } from "swf-tree/sprite-tag";
import { GlyphCountProvider, ParseContext } from "../parse-context";
import { BitStream, ByteStream, Stream } from "../stream";
import { parseActionString } from "./avm1";
import {
  parseColorTransform,
  parseColorTransformWithAlpha,
  parseMatrix,
  parseRect,
  parseSRgb8,
  parseStraightSRgba8,
} from "./basic-data-types";
import { ButtonVersion, parseButton2CondActionString, parseButtonRecordString } from "./button";
import { parseBlendMode, parseClipActionsString, parseFilterList } from "./display";
import {
  ERRONEOUS_JPEG_START,
  getGifImageDimensions,
  getJpegImageDimensions,
  getPngImageDimensions,
  GIF_START,
  ImageDimensions,
  JPEG_START,
  PNG_START,
  testImageStart,
} from "./image";
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
export function parseTagBlockString(byteStream: ByteStream, context: ParseContext): Tag[] {
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

export function parseTag(byteStream: ByteStream, context: ParseContext): Tag {
  const {code, length}: TagHeader = parseTagHeader(byteStream);
  const tag: Tag = parseTagBody(byteStream.take(length), code, context);
  switch (tag.type) {
    case TagType.DefineFont:
      if (tag.glyphs !== undefined) {
        context.setGlyphCount(tag.id, tag.glyphs.length);
      } else {
        // TODO: Explain why we are using 0: does it make sense? Maybe `undefined` is better?
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

function parseTagHeader(byteStream: ByteStream): TagHeader {
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

// tslint:disable-next-line:cyclomatic-complexity
function parseTagBody(byteStream: ByteStream, tagCode: Uint8, context: ParseContext): Tag {
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
    case 20:
      return parseDefineBitsLossless(byteStream);
    case 22:
      return parseDefineShape2(byteStream);
    case 26: {
      const swfVersion: Uint8 | undefined = context.getVersion();
      if (swfVersion === undefined) {
        throw new Incident("Missing SWF version, unable to parse placeObject2");
      }
      return parsePlaceObject2(byteStream, swfVersion);
    }
    case 28:
      return parseRemoveObject2(byteStream);
    case 32:
      return parseDefineShape3(byteStream);
    case 34:
      return parseDefineButton2(byteStream);
    case 35: {
      const swfVersion: Uint8 | undefined = context.getVersion();
      if (swfVersion === undefined) {
        throw new Incident("Missing SWF version, unable to parse defineBitsJpeg3");
      }
      return parseDefineBitsJpeg3(byteStream, swfVersion);
    }
    case 36:
      return parseDefineBitsLossless2(byteStream);
    case 37:
      return parseDefineEditText(byteStream);
    case 39:
      return parseDefineSprite(byteStream, context);
    case 43:
      return parseFrameLabel(byteStream);
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
      return parseDefineFont3(byteStream);
    case 77:
      return parseMetadata(byteStream);
    case 83:
      return parseDefineShape4(byteStream);
    case 84:
      return parseDefineMorphShape2(byteStream);
    case 86:
      return parseDefineSceneAndFrameLabelData(byteStream);
    case 88:
      return parseDefineFontName(byteStream);
    default:
      return {type: TagType.Unknown, code: tagCode, data: Uint8Array.from(byteStream.tailBytes())};
  }
}

export function parseDefineBitsJpeg3(byteStream: ByteStream, swfVersion: Uint8): tags.DefineBitmap {
  const id: Uint16 = byteStream.readUint16LE();

  const bytePos: UintSize = byteStream.bytePos;

  const dataSize: Uint32 = byteStream.readUint32LE();
  let data: Uint8Array = byteStream.takeBytes(dataSize);

  let mediaType: ImageType;
  let imageDimensions: ImageDimensions;

  if (testImageStart(data, JPEG_START) || (swfVersion < 8 && testImageStart(data, ERRONEOUS_JPEG_START))) {
    mediaType = "image/jpeg";
    imageDimensions = getJpegImageDimensions(new Stream(data));
    if (byteStream.available() > 0) {
      mediaType = "image/x-ajpeg";
      byteStream.bytePos = bytePos;
      data = byteStream.tailBytes();
    }
  } else if (testImageStart(data, PNG_START)) {
    mediaType = "image/png";
    imageDimensions = getPngImageDimensions(new Stream(data));
  } else if (testImageStart(data, GIF_START)) {
    mediaType = "image/gif";
    imageDimensions = getGifImageDimensions(new Stream(data));
  } else {
    throw new Incident("UnknownBitmapType");
  }

  return {type: TagType.DefineBitmap, id, ...imageDimensions, mediaType, data};
}

export function parseDefineBitsLossless(byteStream: ByteStream): tags.DefineBitmap {
  return parseDefineBitsLosslessAny(byteStream, "image/x-swf-bmp");
}

export function parseDefineBitsLossless2(byteStream: ByteStream): tags.DefineBitmap {
  return parseDefineBitsLosslessAny(byteStream, "image/x-swf-abmp");
}

export function parseDefineBitsLosslessAny(
  byteStream: ByteStream,
  mediaType: "image/x-swf-abmp" | "image/x-swf-bmp",
): tags.DefineBitmap {
  const id: Uint16 = byteStream.readUint16LE();

  const startPos: UintSize = byteStream.bytePos;
  byteStream.skip(1); // BitmapFormat
  const width: Uint16 = byteStream.readUint16LE();
  const height: Uint16 = byteStream.readUint16LE();
  byteStream.bytePos = startPos;
  const data: Uint8Array = byteStream.tailBytes();

  return {type: TagType.DefineBitmap, id, width, height, mediaType, data};
}

export function parseDefineButton2(byteStream: ByteStream): tags.DefineButton {
  const buttonId: Uint16 = byteStream.readUint16LE();
  const flags: Uint8 = byteStream.readUint8();
  const trackAsMenu: boolean = (flags & (1 << 0)) !== 0;
  const actionOffset: Uint16 = byteStream.readUint16LE();
  const characters: ButtonRecord[] = parseButtonRecordString(byteStream, ButtonVersion.Button2);
  const actions: ButtonCondAction[] = actionOffset === 0 ? [] : parseButton2CondActionString(byteStream);
  return {type: TagType.DefineButton, buttonId, trackAsMenu, characters, actions};
}

export function parseCsmTextSettings(byteStream: ByteStream): tags.CsmTextSettings {
  const textId: Uint16 = byteStream.readUint16LE();
  const bitStream: BitStream = byteStream.asBitStream();
  const renderer: text.TextRenderer = parseTextRendererBits(bitStream);
  const fitting: text.GridFitting = parseGridFittingBits(bitStream);
  bitStream.align();
  const thickness: Float32 = byteStream.readFloat32BE();
  const sharpness: Float32 = byteStream.readFloat32BE();
  byteStream.skip(1);
  return {type: TagType.CsmTextSettings, textId, renderer, fitting, thickness, sharpness};
}

export function parseDefineFont3(byteStream: ByteStream): tags.DefineFont {
  const id: Uint16 = byteStream.readUint16LE();

  const flags: Uint8 = byteStream.readUint8();
  const isBold = (flags & (1 << 0)) !== 0;
  const isItalic = (flags & (1 << 1)) !== 0;
  const useWideCodes = (flags & (1 << 2)) !== 0;
  const useWideOffsets = (flags & (1 << 3)) !== 0;
  const isAnsi = (flags & (1 << 4)) !== 0;
  const isSmall = (flags & (1 << 5)) !== 0;
  const isShiftJis = (flags & (1 << 6)) !== 0;
  const hasLayout = (flags & (1 << 7)) !== 0;

  const language: LanguageCode = parseLanguageCode(byteStream);
  const fontNameLength: UintSize = byteStream.readUint8();
  const fontName: string = byteStream.readString(fontNameLength); // TODO: Check if there is a null byte

  const glyphCount: UintSize = byteStream.readUint16LE();
  if (glyphCount === 0) {
    // According to Shumway:
    // > The SWF format docs doesn't say that, but the DefineFont{2,3} tag ends here for device fonts.
    // Counter-example: mt/hammerfest/game.swf, has still 2 bytes for Verdana

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
  byteStream: ByteStream,
  glyphCountProvider: GlyphCountProvider,
): tags.DefineFontAlignZones {
  const fontId: Uint16 = byteStream.readUint16LE();
  const glyphCount: UintSize | undefined = glyphCountProvider(fontId);
  if (glyphCount === undefined) {
    throw new Incident("ParseError", `ParseDefineFontAlignZones: Unknown font for id: ${fontId}`);
  }
  const bitStream: BitStream = byteStream.asBitStream();
  const csmTableHint: text.CsmTableHint = parseCsmTableHintBits(bitStream);
  bitStream.align();
  const zones: text.FontAlignmentZone[] = [];
  for (let i: number = 0; i < glyphCount; i++) {
    zones.push(parseFontAlignmentZone(byteStream));
  }
  return {type: TagType.DefineFontAlignZones, fontId, csmTableHint, zones};
}

export function parseDefineFontName(byteStream: ByteStream): tags.DefineFontName {
  const fontId: Uint16 = byteStream.readUint16LE();
  const name: string = byteStream.readCString();
  const copyright: string = byteStream.readCString();
  return {type: TagType.DefineFontName, fontId, name, copyright};
}

export function parseDefineMorphShape(byteStream: ByteStream): tags.DefineMorphShape {
  return parseDefineMorphShapeAny(byteStream, MorphShapeVersion.MorphShape1);
}

export function parseDefineMorphShape2(byteStream: ByteStream): tags.DefineMorphShape {
  return parseDefineMorphShapeAny(byteStream, MorphShapeVersion.MorphShape2);
}

export function parseDefineMorphShapeAny(
  byteStream: ByteStream,
  morphShapeVersion: MorphShapeVersion,
): tags.DefineMorphShape {
  const id: Uint16 = byteStream.readUint16LE();
  const startBounds: Rect = parseRect(byteStream);
  const endBounds: Rect = parseRect(byteStream);

  let startEdgeBounds: Rect | undefined = undefined;
  let endEdgeBounds: Rect | undefined = undefined;
  let hasNonScalingStrokes: boolean = false;
  let hasScalingStrokes: boolean = false;
  if (morphShapeVersion === MorphShapeVersion.MorphShape2) {
    startEdgeBounds = parseRect(byteStream);
    endEdgeBounds = parseRect(byteStream);
    const flags: Uint8 = byteStream.readUint8();
    // (Skip first 6 bits)
    hasNonScalingStrokes = (flags & (1 << 1)) !== 0;
    hasScalingStrokes = (flags & (1 << 0)) !== 0;
  }

  const shape: MorphShape = parseMorphShape(byteStream, morphShapeVersion);

  return {
    type: TagType.DefineMorphShape,
    id,
    startBounds,
    endBounds,
    startEdgeBounds,
    endEdgeBounds,
    hasNonScalingStrokes,
    hasScalingStrokes,
    shape,
  };
}

export function parseDefineSceneAndFrameLabelData(byteStream: ByteStream): tags.DefineSceneAndFrameLabelData {
  const sceneCount: Uint32 = byteStream.readUint32Leb128();
  const scenes: Scene[] = [];
  for (let i: number = 0; i < sceneCount; i++) {
    const offset: number = byteStream.readUint32Leb128();
    const name: string = byteStream.readCString();
    scenes.push({offset, name});
  }
  const labelCount: Uint32 = byteStream.readUint32Leb128();
  const labels: Label[] = [];
  for (let i: number = 0; i < labelCount; i++) {
    const frame: number = byteStream.readUint32Leb128();
    const name: string = byteStream.readCString();
    labels.push({frame, name});
  }

  return {
    type: TagType.DefineSceneAndFrameLabelData,
    scenes,
    labels,
  };
}

export function parseDefineShape(byteStream: ByteStream): tags.DefineShape {
  return parseDefineShapeAny(byteStream, ShapeVersion.Shape1);
}

export function parseDefineShape2(byteStream: ByteStream): tags.DefineShape {
  return parseDefineShapeAny(byteStream, ShapeVersion.Shape2);
}

export function parseDefineShape3(byteStream: ByteStream): tags.DefineShape {
  return parseDefineShapeAny(byteStream, ShapeVersion.Shape3);
}

export function parseDefineShape4(byteStream: ByteStream): tags.DefineShape {
  return parseDefineShapeAny(byteStream, ShapeVersion.Shape4);
}

function parseDefineShapeAny(byteStream: ByteStream, shapeVersion: ShapeVersion): tags.DefineShape {
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);
  let edgeBounds: Rect | undefined = undefined;
  let hasFillWinding: boolean = false;
  let hasNonScalingStrokes: boolean = false;
  let hasScalingStrokes: boolean = false;
  if (shapeVersion === ShapeVersion.Shape4) {
    edgeBounds = parseRect(byteStream);
    const flags: Uint8 = byteStream.readUint8();
    // (Skip first 5 bits)
    hasFillWinding = (flags & (1 << 2)) !== 0;
    hasNonScalingStrokes = (flags & (1 << 1)) !== 0;
    hasScalingStrokes = (flags & (1 << 0)) !== 0;
  }
  const shape: Shape = parseShape(byteStream, shapeVersion);

  return {
    type: TagType.DefineShape,
    id,
    bounds,
    edgeBounds,
    hasFillWinding,
    hasNonScalingStrokes,
    hasScalingStrokes,
    shape,
  };
}

export function parseDefineEditText(byteStream: ByteStream): tags.DefineDynamicText {
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

export function parseDefineSprite(byteStream: ByteStream, context: ParseContext): tags.DefineSprite {
  const id: Uint16 = byteStream.readUint16LE();
  const frameCount: UintSize = byteStream.readUint16LE();
  const tags: Tag[] = parseTagBlockString(byteStream, context);
  return {
    type: TagType.DefineSprite,
    id,
    frameCount,
    // TODO: Check validity of the tags
    tags: tags as SpriteTag[],
  };
}

export function parseDefineText(byteStream: ByteStream): tags.DefineText {
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);
  const matrix: Matrix = parseMatrix(byteStream);
  const indexBits: UintSize = byteStream.readUint8();
  const advanceBits: UintSize = byteStream.readUint8();
  const records: text.TextRecord[] = parseTextRecordString(byteStream, false, indexBits, advanceBits);
  return {type: TagType.DefineText, id, bounds, matrix, records};
}

export function parseDefineText2(byteStream: ByteStream): tags.DefineText {
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);
  const matrix: Matrix = parseMatrix(byteStream);
  const indexBits: UintSize = byteStream.readUint8();
  const advanceBits: UintSize = byteStream.readUint8();
  const records: text.TextRecord[] = parseTextRecordString(byteStream, true, indexBits, advanceBits);
  return {type: TagType.DefineText, id, bounds, matrix, records};
}

export function parseDoAction(byteStream: ByteStream): tags.DoAction {
  return {type: TagType.DoAction, actions: parseActionString(byteStream)};
}

export function parseDoInitAction(byteStream: ByteStream): tags.DoInitAction {
  const spriteId: Uint16 = byteStream.readUint16LE();
  return {type: TagType.DoInitAction, spriteId, actions: parseActionString(byteStream)};
}

export function parseExportAssets(byteStream: ByteStream): tags.ExportAssets {
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

export function parseFileAttributes(byteStream: ByteStream): tags.FileAttributes {
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

export function parseFrameLabel(byteStream: ByteStream): tags.FrameLabel {
  const name: string = byteStream.readCString();
  const anchorFlag: boolean = byteStream.available() > 1 && byteStream.readUint8() !== 0;
  return {
    type: TagType.FrameLabel,
    name,
    anchorFlag,
  };
}

export function parseImportAssets(byteStream: ByteStream): tags.ImportAssets {
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

export function parseImportAssets2(byteStream: ByteStream): tags.ImportAssets {
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

export function parseMetadata(byteStream: ByteStream): tags.Metadata {
  return {type: TagType.Metadata, metadata: byteStream.readCString()};
}

export function parsePlaceObject(byteStream: ByteStream): tags.PlaceObject {
  const characterId: Uint16 = byteStream.readUint16LE();
  const depth: Uint16 = byteStream.readUint16LE();
  const matrix: Matrix = parseMatrix(byteStream);
  let colorTransform: ColorTransformWithAlpha | undefined = undefined;
  if (byteStream.available() > 0) {
    colorTransform = {
      ...parseColorTransform(byteStream),
      alphaMult: Sfixed8P8.fromValue(1),
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

export function parsePlaceObject2(byteStream: ByteStream, swfVersion: UintSize): tags.PlaceObject {
  const flags: Uint16 = byteStream.readUint8();
  const hasClipActions: boolean = (flags & (1 << 7)) !== 0;
  const hasClipDepth: boolean = (flags & (1 << 6)) !== 0;
  const hasName: boolean = (flags & (1 << 5)) !== 0;
  const hasRatio: boolean = (flags & (1 << 4)) !== 0;
  const hasColorTransform: boolean = (flags & (1 << 3)) !== 0;
  const hasMatrix: boolean = (flags & (1 << 2)) !== 0;
  const hasCharacterId: boolean = (flags & (1 << 1)) !== 0;
  const isMove: boolean = (flags & (1 << 0)) !== 0;
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
  const flags: Uint16 = byteStream.readUint16LE();
  // Skip one bit (bit 15)
  const hasBackgroundColor: boolean = (flags & (1 << 14)) !== 0;
  const hasVisibility: boolean = (flags & (1 << 13)) !== 0;
  const hasImage: boolean = (flags & (1 << 12)) !== 0;
  const hasClassName: boolean = (flags & (1 << 11)) !== 0;
  const hasCacheHint: boolean = (flags & (1 << 10)) !== 0;
  const hasBlendMode: boolean = (flags & (1 << 9)) !== 0;
  const hasFilters: boolean = (flags & (1 << 8)) !== 0;
  const hasClipActions: boolean = (flags & (1 << 7)) !== 0;
  const hasClipDepth: boolean = (flags & (1 << 6)) !== 0;
  const hasName: boolean = (flags & (1 << 5)) !== 0;
  const hasRatio: boolean = (flags & (1 << 4)) !== 0;
  const hasColorTransform: boolean = (flags & (1 << 3)) !== 0;
  const hasMatrix: boolean = (flags & (1 << 2)) !== 0;
  const hasCharacterId: boolean = (flags & (1 << 1)) !== 0;
  const isMove: boolean = (flags & (1 << 0)) !== 0;
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

export function parseRemoveObject(byteStream: ByteStream): tags.RemoveObject {
  const characterId: Uint16 = byteStream.readUint16LE();
  const depth: Uint16 = byteStream.readUint16LE();
  return {type: TagType.RemoveObject, characterId, depth};
}

export function parseRemoveObject2(byteStream: ByteStream): tags.RemoveObject {
  const depth: Uint16 = byteStream.readUint16LE();
  return {type: TagType.RemoveObject, depth};
}

export function parseSetBackgroundColor(byteStream: ByteStream): tags.SetBackgroundColor {
  return {type: TagType.SetBackgroundColor, color: parseSRgb8(byteStream)};
}
