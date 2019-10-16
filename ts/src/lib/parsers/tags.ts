// tslint:disable:max-file-line-count

import { ReadableBitStream, ReadableByteStream, ReadableStream } from "@open-flash/stream";
import { Incident } from "incident";
import { Float32, Sint16, Uint16, Uint2, Uint3, Uint32, Uint4, Uint8, UintSize } from "semantic-types";
import {
  BlendMode,
  ClipAction,
  ColorTransform,
  ColorTransformWithAlpha,
  Filter,
  Glyph,
  Label,
  LanguageCode,
  Matrix,
  NamedId,
  Rect,
  Scene,
  Sfixed8P8,
  Shape,
  StraightSRgba8,
  Tag,
  tags,
  TagType,
  text,
} from "swf-tree";
import { ButtonCondAction } from "swf-tree/button/button-cond-action";
import { ButtonRecord } from "swf-tree/button/button-record";
import { ButtonSound } from "swf-tree/button/button-sound";
import { ImageType } from "swf-tree/image-type";
import { MorphShape } from "swf-tree/morph-shape";
import { AudioCodingFormat } from "swf-tree/sound/audio-coding-format";
import { SoundInfo } from "swf-tree/sound/sound-info";
import { SoundRate } from "swf-tree/sound/sound-rate";
import { SoundSize } from "swf-tree/sound/sound-size";
import { SoundType } from "swf-tree/sound/sound-type";
import { SpriteTag } from "swf-tree/sprite-tag";
import { TagHeader } from "swf-tree/tag-header";
import { TextAlignment } from "swf-tree/text";
import { EmSquareSize } from "swf-tree/text/em-square-size";
import { VideoCodec } from "swf-tree/video/video-codec";
import { VideoDeblocking } from "swf-tree/video/video-deblocking";
import { GlyphCountProvider, ParseContext } from "../parse-context";
import {
  parseBlockCString,
  parseColorTransform,
  parseColorTransformWithAlpha,
  parseMatrix,
  parseRect,
  parseSRgb8,
  parseStraightSRgba8,
} from "./basic-data-types";
import { ButtonVersion, parseButton2CondActionString, parseButtonRecordString, parseButtonSound } from "./button";
import { parseBlendMode, parseClipActionString, parseFilterList } from "./display";
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
import { parseGlyph, parseShape, ShapeVersion } from "./shape";
import {
  getAudioCodingFormatFromCode,
  getSoundRateFromCode,
  isUncompressedAudioCodingFormat,
  parseSoundInfo,
} from "./sound";
import {
  FontVersion,
  parseCsmTableHintBits,
  parseFontAlignmentZone,
  parseFontLayout,
  parseGridFittingBits,
  parseLanguageCode,
  parseOffsetGlyphs,
  parseTextAlignment,
  parseTextRecordString,
  parseTextRendererBits,
  TextVersion,
} from "./text";
import { getVideoDeblockingFromCode, parseVideoCodec } from "./video";

/**
 * Read tags until the end of the stream or "end-of-tags".
 */
export function parseTagBlockString(byteStream: ReadableByteStream, context: ParseContext): Tag[] {
  const tags: Tag[] = [];
  while (byteStream.available() >= 2) {
    // A null byte indicates the end-of-tags
    // TODO: This is false. Example: empty `DoAction`. We should peek an Uint16.
    if (byteStream.peekUint8() === 0) {
      const oldBytePos: UintSize = byteStream.bytePos;
      byteStream.skip(1);
      if (byteStream.peekUint8() === 0) {
        byteStream.skip(1);
        break;
      } else {
        byteStream.bytePos = oldBytePos;
      }
    }
    const tag: Tag = parseTag(byteStream, context);
    tags.push(tag);
  }
  return tags;
}

export function parseTag(byteStream: ReadableByteStream, context: ParseContext): Tag {
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

function parseTagHeader(byteStream: ReadableByteStream): TagHeader {
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
function parseTagBody(byteStream: ReadableByteStream, tagCode: Uint8, context: ParseContext): Tag {
  switch (tagCode) {
    case 1:
      return {type: TagType.ShowFrame};
    case 2:
      return parseDefineShape(byteStream);
    case 4:
      return parsePlaceObject(byteStream);
    case 5:
      return parseRemoveObject(byteStream);
    case 6:
      return parseDefineBits(byteStream, context.getVersion());
    case 7:
      return parseDefineButton(byteStream);
    case 8:
      return parseDefineJpegTables(byteStream, context.getVersion());
    case 9:
      return parseSetBackgroundColor(byteStream);
    case 10:
      return parseDefineFont(byteStream);
    case 11:
      return parseDefineText(byteStream);
    case 12:
      return parseDoAction(byteStream);
    case 13:
      return parseDefineFontInfo(byteStream);
    case 14:
      return parseDefineSound(byteStream);
    case 15:
      return parseStartSound(byteStream);
    case 17:
      return parseDefineButtonSound(byteStream);
    case 18:
      return parseSoundStreamHead(byteStream);
    case 19:
      return parseSoundStreamBlock(byteStream);
    case 20:
      return parseDefineBitsLossless(byteStream);
    case 21:
      return parseDefineBitsJpeg2(byteStream, context.getVersion());
    case 22:
      return parseDefineShape2(byteStream);
    case 23:
      return parseDefineButtonColorTransform(byteStream);
    case 24:
      return parseProtect(byteStream);
    case 25:
      return {type: TagType.EnablePostscript};
    case 26:
      return parsePlaceObject2(byteStream, context.getVersion());
    case 28:
      return parseRemoveObject2(byteStream);
    case 32:
      return parseDefineShape3(byteStream);
    case 33:
      return parseDefineText2(byteStream);
    case 34:
      return parseDefineButton2(byteStream);
    case 35:
      return parseDefineBitsJpeg3(byteStream, context.getVersion());
    case 36:
      return parseDefineBitsLossless2(byteStream);
    case 37:
      return parseDefineEditText(byteStream);
    case 39:
      return parseDefineSprite(byteStream, context);
    case 43:
      return parseFrameLabel(byteStream);
    case 45:
      return parseSoundStreamHead2(byteStream);
    case 46:
      return parseDefineMorphShape(byteStream);
    case 48:
      return parseDefineFont2(byteStream);
    case 56:
      return parseExportAssets(byteStream);
    case 57:
      return parseImportAssets(byteStream);
    case 58:
      return parseEnableDebugger(byteStream);
    case 59:
      return parseDoInitAction(byteStream);
    case 60:
      return parseDefineVideoStream(byteStream);
    case 61:
      return parseVideoFrame(byteStream);
    case 62:
      return parseDefineFontInfo2(byteStream);
    case 64:
      return parseEnableDebugger2(byteStream);
    case 65:
      return parseScriptLimits(byteStream);
    case 66:
      return parseSetTabIndex(byteStream);
    case 69:
      return parseFileAttributes(byteStream);
    case 70:
      return parsePlaceObject3(byteStream, context.getVersion());
    case 71:
      return parseImportAssets2(byteStream);
    case 73:
      return parseDefineFontAlignZones(byteStream, context.getGlyphCount.bind(context));
    case 74:
      return parseCsmTextSettings(byteStream);
    case 75:
      return parseDefineFont3(byteStream);
    case 76:
      return parseSymbolClass(byteStream);
    case 77:
      return parseMetadata(byteStream);
    case 78:
      return parseDefineScalingGrid(byteStream);
    case 82:
      return parseDoAbc(byteStream);
    case 83:
      return parseDefineShape4(byteStream);
    case 84:
      return parseDefineMorphShape2(byteStream);
    case 86:
      return parseDefineSceneAndFrameLabelData(byteStream);
    case 87:
      return parseDefineBinaryData(byteStream);
    case 88:
      return parseDefineFontName(byteStream);
    case 89:
      return parseStartSound2(byteStream);
    case 90:
      return parseDefineBitsJpeg4(byteStream, context.getVersion());
    case 91:
      return parseDefineFont4(byteStream);
    case 93:
      return parseEnableTelemetry(byteStream);
    default:
      console.warn(`UnknownTagType: Code ${tagCode}`);
      return {type: TagType.Unknown, code: tagCode, data: Uint8Array.from(byteStream.tailBytes())};
  }
}

export function parseCsmTextSettings(byteStream: ReadableByteStream): tags.CsmTextSettings {
  const textId: Uint16 = byteStream.readUint16LE();
  const bitStream: ReadableBitStream = byteStream.asBitStream();
  const renderer: text.TextRenderer = parseTextRendererBits(bitStream);
  const fitting: text.GridFitting = parseGridFittingBits(bitStream);
  bitStream.align();
  const thickness: Float32 = byteStream.readFloat32LE();
  const sharpness: Float32 = byteStream.readFloat32LE();
  byteStream.skip(1);
  return {type: TagType.CsmTextSettings, textId, renderer, fitting, thickness, sharpness};
}

export function parseDefineBinaryData(byteStream: ReadableByteStream): tags.DefineBinaryData {
  const id: Uint16 = byteStream.readUint16LE();
  byteStream.readUint32LE(); // TODO: assert == 0
  const data: Uint8Array = byteStream.tailBytes();
  return {type: TagType.DefineBinaryData, id, data};
}

export function parseDefineBits(byteStream: ReadableByteStream, swfVersion: Uint8): tags.DefineBitmap {
  const id: Uint16 = byteStream.readUint16LE();
  const data: Uint8Array = byteStream.tailBytes();

  let imageDimensions: ImageDimensions;

  if (testImageStart(data, JPEG_START) || (swfVersion < 8 && testImageStart(data, ERRONEOUS_JPEG_START))) {
    imageDimensions = getJpegImageDimensions(new ReadableStream(data));
  } else {
    throw new Incident("UnknownBitmapType");
  }

  return {type: TagType.DefineBitmap, id, ...imageDimensions, mediaType: "image/x-partial-jpeg", data};
}

export function parseDefineBitsJpeg2(byteStream: ReadableByteStream, swfVersion: Uint8): tags.DefineBitmap {
  const id: Uint16 = byteStream.readUint16LE();
  const data: Uint8Array = byteStream.tailBytes();

  let mediaType: ImageType;
  let imageDimensions: ImageDimensions;

  if (testImageStart(data, JPEG_START) || (swfVersion < 8 && testImageStart(data, ERRONEOUS_JPEG_START))) {
    mediaType = "image/jpeg";
    imageDimensions = getJpegImageDimensions(new ReadableStream(data));
  } else if (testImageStart(data, PNG_START)) {
    mediaType = "image/png";
    imageDimensions = getPngImageDimensions(new ReadableStream(data));
  } else if (testImageStart(data, GIF_START)) {
    mediaType = "image/gif";
    imageDimensions = getGifImageDimensions(new ReadableStream(data));
  } else {
    throw new Incident("UnknownBitmapType");
  }

  return {type: TagType.DefineBitmap, id, ...imageDimensions, mediaType, data};
}

export function parseDefineBitsJpeg3(byteStream: ReadableByteStream, swfVersion: Uint8): tags.DefineBitmap {
  const id: Uint16 = byteStream.readUint16LE();

  const bytePos: UintSize = byteStream.bytePos;

  const dataLen: Uint32 = byteStream.readUint32LE();
  let data: Uint8Array = byteStream.takeBytes(dataLen);
  let mediaType: ImageType;
  let imageDimensions: ImageDimensions;

  if (testImageStart(data, JPEG_START) || (swfVersion < 8 && testImageStart(data, ERRONEOUS_JPEG_START))) {
    mediaType = "image/jpeg";
    imageDimensions = getJpegImageDimensions(new ReadableStream(data));
    if (byteStream.available() > 0) {
      mediaType = "image/x-ajpeg";
      byteStream.bytePos = bytePos;
      data = byteStream.tailBytes();
    }
  } else if (testImageStart(data, PNG_START)) {
    mediaType = "image/png";
    imageDimensions = getPngImageDimensions(new ReadableStream(data));
  } else if (testImageStart(data, GIF_START)) {
    mediaType = "image/gif";
    imageDimensions = getGifImageDimensions(new ReadableStream(data));
  } else {
    throw new Incident("UnknownBitmapType");
  }

  return {type: TagType.DefineBitmap, id, ...imageDimensions, mediaType, data};
}

// TODO: Merge defineBitsJpegX functions into defineBitsJpegAny
export function parseDefineBitsJpeg4(_byteStream: ReadableByteStream, _swfVersion: Uint8): tags.DefineBitmap {
  throw new Incident("Unsupported DefineBitsJpeg4");
}

export function parseDefineBitsLossless(byteStream: ReadableByteStream): tags.DefineBitmap {
  return parseDefineBitsLosslessAny(byteStream, "image/x-swf-bmp");
}

export function parseDefineBitsLossless2(byteStream: ReadableByteStream): tags.DefineBitmap {
  return parseDefineBitsLosslessAny(byteStream, "image/x-swf-abmp");
}

function parseDefineBitsLosslessAny(
  byteStream: ReadableByteStream,
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

export function parseDefineButton(byteStream: ReadableByteStream): tags.DefineButton {
  const id: Uint16 = byteStream.readUint16LE();
  const trackAsMenu: boolean = false;

  const characters: ButtonRecord[] = parseButtonRecordString(byteStream, ButtonVersion.Button1);
  const actions: Uint8Array = Uint8Array.from(byteStream.tailBytes());
  const condAction: ButtonCondAction = {actions};

  return {type: TagType.DefineButton, id, trackAsMenu, characters, actions: [condAction]};
}

export function parseDefineButton2(byteStream: ReadableByteStream): tags.DefineButton {
  const id: Uint16 = byteStream.readUint16LE();
  const flags: Uint8 = byteStream.readUint8();
  const trackAsMenu: boolean = (flags & (1 << 0)) !== 0;
  // Skip bits [1, 7]
  const pos: UintSize = byteStream.bytePos;
  const actionOffset: Uint16 = byteStream.readUint16LE();
  const characters: ButtonRecord[] = parseButtonRecordString(byteStream, ButtonVersion.Button2);
  let actions: ButtonCondAction[];
  if (actionOffset === 0) {
    actions = [];
  } else {
    const actionPos: UintSize = pos + actionOffset;
    if (byteStream.bytePos !== actionPos) {
      throw new Error("Bytestream position does not match DefineButton2 action position");
    }
    actions = parseButton2CondActionString(byteStream);
  }
  return {type: TagType.DefineButton, id, trackAsMenu, characters, actions};
}

export function parseDefineButtonColorTransform(byteStream: ReadableByteStream): tags.DefineButtonColorTransform {
  const buttonId: Uint16 = byteStream.readUint16LE();
  const transform: ColorTransform = parseColorTransform(byteStream);
  return {
    type: TagType.DefineButtonColorTransform,
    buttonId,
    transform,
  };
}

export function parseDefineButtonSound(byteStream: ReadableByteStream): tags.DefineButtonSound {
  const buttonId: Uint16 = byteStream.readUint16LE();
  const overUpToIdle: ButtonSound | undefined = parseButtonSound(byteStream);
  const idleToOverUp: ButtonSound | undefined = parseButtonSound(byteStream);
  const overUpToOverDown: ButtonSound | undefined = parseButtonSound(byteStream);
  const overDownToOverUp: ButtonSound | undefined = parseButtonSound(byteStream);

  return {
    type: TagType.DefineButtonSound,
    buttonId,
    overUpToIdle,
    idleToOverUp,
    overUpToOverDown,
    overDownToOverUp,
  };
}

export function parseDefineEditText(byteStream: ReadableByteStream): tags.DefineDynamicText {
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);

  const flags: Uint16 = byteStream.readUint16LE();
  const hasFont: boolean = (flags & (1 << 0)) !== 0;
  const hasMaxLength: boolean = (flags & (1 << 1)) !== 0;
  const hasColor: boolean = (flags & (1 << 2)) !== 0;
  const readonly: boolean = (flags & (1 << 3)) !== 0;
  const password: boolean = (flags & (1 << 4)) !== 0;
  const multiline: boolean = (flags & (1 << 5)) !== 0;
  const wordWrap: boolean = (flags & (1 << 6)) !== 0;
  const hasText: boolean = (flags & (1 << 7)) !== 0;
  const useGlyphFont: boolean = (flags & (1 << 8)) !== 0;
  const html: boolean = (flags & (1 << 9)) !== 0;
  const wasStatic: boolean = (flags & (1 << 10)) !== 0;
  const border: boolean = (flags & (1 << 11)) !== 0;
  const noSelect: boolean = (flags & (1 << 12)) !== 0;
  const hasLayout: boolean = (flags & (1 << 13)) !== 0;
  const autoSize: boolean = (flags & (1 << 14)) !== 0;
  const hasFontClass: boolean = (flags & (1 << 15)) !== 0;
  // TODO: Assert that !(hasFont && hasFontClass) (mutual exclusion)

  const fontId: Uint16 | undefined = hasFont ? byteStream.readUint16LE() : undefined;
  const fontClass: string | undefined = hasFontClass ? byteStream.readCString() : undefined;
  const fontSize: Uint16 | undefined = (hasFont || hasFontClass) ? byteStream.readUint16LE() : undefined;
  const color: StraightSRgba8 | undefined = hasColor ? parseStraightSRgba8(byteStream) : undefined;
  const maxLength: UintSize | undefined = hasMaxLength ? byteStream.readUint16LE() : undefined;
  const align: text.TextAlignment = hasLayout ? parseTextAlignment(byteStream) : TextAlignment.Left;
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

export function parseDefineFont(byteStream: ReadableByteStream): tags.DefineGlyphFont {
  const id: Uint16 = byteStream.readUint16LE();

  const glyphs: Glyph[] = [];
  const available: UintSize = byteStream.available();
  if (available > 0) {
    const startPos: UintSize = byteStream.bytePos;

    const offsetToFirstGlyph: Uint16 = byteStream.readUint16LE();
    // Dividing by 2 since each glyph offset takes 2 bytes.
    // TODO: Assert that `offsetToFirstGlyph` is even
    const glyphCount: UintSize = Math.floor(offsetToFirstGlyph / 2);
    const offsets: UintSize[] = [offsetToFirstGlyph];
    for (let i: UintSize = 1; i < glyphCount; i++) {
      offsets.push(byteStream.readUint16LE());
    }
    offsets.push(available);

    for (let i: number = 1; i < offsets.length; i++) {
      const length: UintSize = offsets[i] - (byteStream.bytePos - startPos);
      // TODO: special mode when parsing the shape: the first changeStyle is
      //       forced to have stateFillStyle0 and stateFill0
      glyphs.push(parseGlyph(byteStream.take(length)));
    }
  }

  return {
    type: TagType.DefineGlyphFont,
    id,
    glyphs,
  };
}

export function parseDefineFont2(byteStream: ReadableByteStream): tags.DefineFont {
  return parseDefineFontAny(byteStream, FontVersion.Font2);
}

export function parseDefineFont3(byteStream: ReadableByteStream): tags.DefineFont {
  return parseDefineFontAny(byteStream, FontVersion.Font3);
}

// https://github.com/mozilla/shumway/blob/16451d8836fa85f4b16eeda8b4bda2fa9e2b22b0/src/swf/parser/module.ts#L632
function parseDefineFontAny(byteStream: ReadableByteStream, version: FontVersion): tags.DefineFont {
  const id: Uint16 = byteStream.readUint16LE();

  const flags: Uint8 = byteStream.readUint8();
  const isBold: boolean = (flags & (1 << 0)) !== 0;
  const isItalic: boolean = (flags & (1 << 1)) !== 0;
  const useWideCodes: boolean = (flags & (1 << 2)) !== 0;
  const useWideOffsets: boolean = (flags & (1 << 3)) !== 0;
  const isAnsi: boolean = (flags & (1 << 4)) !== 0;
  const isSmall: boolean = (flags & (1 << 5)) !== 0;
  const isShiftJis: boolean = (flags & (1 << 6)) !== 0;
  const hasLayout: boolean = (flags & (1 << 7)) !== 0;

  const emSquareSize: EmSquareSize = version >= FontVersion.Font3 ? 20480 : 1024;

  const language: LanguageCode = parseLanguageCode(byteStream);
  const fontNameLength: UintSize = byteStream.readUint8();
  const fontName: string = parseBlockCString(byteStream, fontNameLength);

  const glyphCount: UintSize = byteStream.readUint16LE();
  if (glyphCount === 0) {
    // According to Shumway:
    // > The SWF format docs doesn't say that, but the DefineFont{2,3} tag ends here for device fonts.
    // See the sample `open-flash-db/tags/define-font-df3-system-font-verdana`.

    // System font
    return {
      type: TagType.DefineFont,
      id,
      fontName,
      isBold,
      isItalic,
      isAnsi,
      isSmall,
      isShiftJis,
      emSquareSize,
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
    isBold,
    isItalic,
    isAnsi,
    isSmall,
    isShiftJis,
    emSquareSize,
    language,
    glyphs,
    codeUnits,
    layout,
  };
}

export function parseDefineFont4(byteStream: ReadableByteStream): tags.DefineCffFont {
  const id: Uint16 = byteStream.readUint16LE();

  const flags: Uint8 = byteStream.readUint8();
  const isBold: boolean = (flags & (1 << 0)) !== 0;
  const isItalic: boolean = (flags & (1 << 1)) !== 0;
  const hasData: boolean = (flags & (1 << 2)) !== 0;
  // Bits [3, 7] are reserved

  const fontName: string = byteStream.readCString();

  const data: Uint8Array | undefined = hasData ? byteStream.tailBytes() : undefined;

  return {
    type: TagType.DefineCffFont,
    id,
    fontName,
    isBold,
    isItalic,
    data,
  };
}

export function parseDefineFontAlignZones(
  byteStream: ReadableByteStream,
  glyphCountProvider: GlyphCountProvider,
): tags.DefineFontAlignZones {
  const fontId: Uint16 = byteStream.readUint16LE();
  const glyphCount: UintSize | undefined = glyphCountProvider(fontId);
  if (glyphCount === undefined) {
    throw new Incident("ParseError", `ParseDefineFontAlignZones: Unknown font for id: ${fontId}`);
  }
  const bitStream: ReadableBitStream = byteStream.asBitStream();
  const csmTableHint: text.CsmTableHint = parseCsmTableHintBits(bitStream);
  bitStream.align();
  const zones: text.FontAlignmentZone[] = [];
  for (let i: number = 0; i < glyphCount; i++) {
    zones.push(parseFontAlignmentZone(byteStream));
  }
  return {type: TagType.DefineFontAlignZones, fontId, csmTableHint, zones};
}

export function parseDefineFontInfo(byteStream: ReadableByteStream): tags.DefineFontInfo {
  const id: Uint16 = byteStream.readUint16LE();

  const fontNameLength: UintSize = byteStream.readUint8();
  const fontName: string = parseBlockCString(byteStream, fontNameLength);

  const flags: Uint8 = byteStream.readUint8();
  const useWideCodes: boolean = (flags & (1 << 0)) !== 0;
  const isBold: boolean = (flags & (1 << 1)) !== 0;
  const isItalic: boolean = (flags & (1 << 2)) !== 0;
  const isAnsi: boolean = (flags & (1 << 3)) !== 0;
  const isShiftJis: boolean = (flags & (1 << 4)) !== 0;
  const isSmall: boolean = (flags & (1 << 5)) !== 0;

  // const emSquareSize: EmSquareSize = 1024;

  const language: LanguageCode = LanguageCode.Auto;

  const codeUnits: Uint16[] = [];
  if (useWideCodes) {
    // TODO: Handle odd values.
    const codeUintCount: UintSize = Math.floor(byteStream.available() / 2);
    for (let i: UintSize = 0; i < codeUintCount; i++) {
      codeUnits.push(byteStream.readUint16LE());
    }
  } else {
    const codeUintCount: UintSize = byteStream.available();
    for (let i: UintSize = 0; i < codeUintCount; i++) {
      codeUnits.push(byteStream.readUint8());
    }
  }

  return {
    type: TagType.DefineFontInfo,
    fontId: id,
    fontName,
    isBold,
    isItalic,
    isAnsi,
    isSmall,
    isShiftJis,
    language,
    codeUnits,
  };
}

export function parseDefineFontInfo2(_byteStream: ReadableByteStream): tags.DefineFontInfo {
  throw new Incident("NotImplemented", "parseDefineFontInfo2");
}

export function parseDefineFontName(byteStream: ReadableByteStream): tags.DefineFontName {
  const fontId: Uint16 = byteStream.readUint16LE();
  const name: string = byteStream.readCString();
  const copyright: string = byteStream.readCString();
  return {type: TagType.DefineFontName, fontId, name, copyright};
}

export function parseDefineJpegTables(byteStream: ReadableByteStream, _swfVersion: Uint8): tags.DefineJpegTables {
  const data: Uint8Array = byteStream.tailBytes();
  // TODO: Check validity of jpeg tables?
  // Can be empty (e.g. `open-flash-db/standalone-movies/homestuck-02791`
  // if (!(testImageStart(data, JPEG_START) || (swfVersion < 8 && testImageStart(data, ERRONEOUS_JPEG_START)))) {
  //   throw new Incident(`InvalidJpegTablesSignature`);
  // }
  return {type: TagType.DefineJpegTables, data};
}

export function parseDefineMorphShape(byteStream: ReadableByteStream): tags.DefineMorphShape {
  return parseDefineMorphShapeAny(byteStream, MorphShapeVersion.MorphShape1);
}

export function parseDefineMorphShape2(byteStream: ReadableByteStream): tags.DefineMorphShape {
  return parseDefineMorphShapeAny(byteStream, MorphShapeVersion.MorphShape2);
}

export function parseDefineMorphShapeAny(
  byteStream: ReadableByteStream,
  morphShapeVersion: MorphShapeVersion,
): tags.DefineMorphShape {
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);
  const morphBounds: Rect = parseRect(byteStream);

  const edgeBounds: Rect | undefined = morphShapeVersion >= MorphShapeVersion.MorphShape2
    ? parseRect(byteStream)
    : undefined;
  const morphEdgeBounds: Rect | undefined = morphShapeVersion >= MorphShapeVersion.MorphShape2
    ? parseRect(byteStream)
    : undefined;
  const flags: Uint8 = morphShapeVersion >= MorphShapeVersion.MorphShape2 ? byteStream.readUint8() : 0;
  const hasScalingStrokes: boolean = (flags & (1 << 0)) !== 0;
  const hasNonScalingStrokes: boolean = (flags & (1 << 1)) !== 0;

  const shape: MorphShape = parseMorphShape(byteStream, morphShapeVersion);

  return {
    type: TagType.DefineMorphShape,
    id,
    bounds,
    morphBounds,
    edgeBounds,
    morphEdgeBounds,
    hasScalingStrokes,
    hasNonScalingStrokes,
    shape,
  };
}

export function parseDefineScalingGrid(byteStream: ReadableByteStream): tags.DefineScalingGrid {
  const characterId: Uint16 = byteStream.readUint16LE();
  const splitter: Rect = parseRect(byteStream);
  return {type: TagType.DefineScalingGrid, characterId, splitter};
}

export function parseDefineSceneAndFrameLabelData(byteStream: ReadableByteStream): tags.DefineSceneAndFrameLabelData {
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

export function parseDefineShape(byteStream: ReadableByteStream): tags.DefineShape {
  return parseDefineShapeAny(byteStream, ShapeVersion.Shape1);
}

export function parseDefineShape2(byteStream: ReadableByteStream): tags.DefineShape {
  return parseDefineShapeAny(byteStream, ShapeVersion.Shape2);
}

export function parseDefineShape3(byteStream: ReadableByteStream): tags.DefineShape {
  return parseDefineShapeAny(byteStream, ShapeVersion.Shape3);
}

export function parseDefineShape4(byteStream: ReadableByteStream): tags.DefineShape {
  return parseDefineShapeAny(byteStream, ShapeVersion.Shape4);
}

function parseDefineShapeAny(byteStream: ReadableByteStream, shapeVersion: ShapeVersion): tags.DefineShape {
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);
  const edgeBounds: Rect | undefined = shapeVersion >= ShapeVersion.Shape4 ? parseRect(byteStream) : undefined;
  const flags: Uint8 = shapeVersion >= ShapeVersion.Shape4 ? byteStream.readUint8() : 0;
  const hasScalingStrokes: boolean = (flags & (1 << 0)) !== 0;
  const hasNonScalingStrokes: boolean = (flags & (1 << 1)) !== 0;
  const hasFillWinding: boolean = (flags & (1 << 2)) !== 0;
  // (Skip bits [3, 7])
  const shape: Shape = parseShape(byteStream, shapeVersion);

  // TODO: Update swf-tree to use this order for the properties
  return {
    type: TagType.DefineShape,
    id,
    bounds,
    edgeBounds,
    hasScalingStrokes,
    hasNonScalingStrokes,
    hasFillWinding,
    shape,
  };
}

function parseDefineSound(byteStream: ReadableByteStream): tags.DefineSound {
  const id: Uint16 = byteStream.readUint16LE();

  const flags: Uint8 = byteStream.readUint8();
  const soundType: SoundType = (flags & (1 << 0)) !== 0 ? SoundType.Stereo : SoundType.Mono;
  let soundSize: SoundSize = (flags & (1 << 1)) !== 0 ? 16 : 8;
  const soundRate: SoundRate = getSoundRateFromCode(((flags >>> 2) & 0b11) as Uint2);
  const format: AudioCodingFormat = getAudioCodingFormatFromCode(((flags >>> 4) & 0b1111) as Uint4);
  if (!isUncompressedAudioCodingFormat(format)) {
    soundSize = 16;
  }

  const sampleCount: Uint32 = byteStream.readUint32LE();
  const data: Uint8Array = byteStream.tailBytes();

  return {type: TagType.DefineSound, id, soundType, soundSize, soundRate, format, sampleCount, data};
}

export function parseDefineSprite(byteStream: ReadableByteStream, context: ParseContext): tags.DefineSprite {
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

export function parseDefineText(byteStream: ReadableByteStream): tags.DefineText {
  return parseDefineTextAny(byteStream, TextVersion.Text1);
}

export function parseDefineText2(byteStream: ReadableByteStream): tags.DefineText {
  return parseDefineTextAny(byteStream, TextVersion.Text2);
}

export function parseDefineTextAny(byteStream: ReadableByteStream, version: TextVersion): tags.DefineText {
  const id: Uint16 = byteStream.readUint16LE();
  const bounds: Rect = parseRect(byteStream);
  const matrix: Matrix = parseMatrix(byteStream);
  const indexBits: UintSize = byteStream.readUint8();
  const advanceBits: UintSize = byteStream.readUint8();
  const hasAlpha: boolean = version >= TextVersion.Text2;
  const records: text.TextRecord[] = parseTextRecordString(byteStream, hasAlpha, indexBits, advanceBits);
  return {type: TagType.DefineText, id, bounds, matrix, records};
}

export function parseDefineVideoStream(byteStream: ReadableByteStream): tags.DefineVideoStream {
  const id: Uint16 = byteStream.readUint16LE();
  const frameCount: Uint16 = byteStream.readUint16LE();
  const width: Uint16 = byteStream.readUint16LE();
  const height: Uint16 = byteStream.readUint16LE();
  const flags: Uint8 = byteStream.readUint8();
  const useSmoothing: boolean = (flags & (1 << 0)) !== 0;
  const deblocking: VideoDeblocking = getVideoDeblockingFromCode(((flags >>> 1) & 0b111) as Uint3);
  // Bits [4,7] are reserved
  const codec: VideoCodec = parseVideoCodec(byteStream);
  return {
    type: TagType.DefineVideoStream,
    id,
    frameCount,
    width,
    height,
    useSmoothing,
    deblocking,
    codec,
  };
}

export function parseDoAbc(byteStream: ReadableByteStream): tags.DoAbc {
  const flags: Uint32 = byteStream.readUint32LE();
  const name: string = byteStream.readCString();
  const data: Uint8Array = Uint8Array.from(byteStream.tailBytes());
  return {type: TagType.DoAbc, flags, name, data};
}

export function parseDoAction(byteStream: ReadableByteStream): tags.DoAction {
  const actions: Uint8Array = Uint8Array.from(byteStream.tailBytes());
  return {type: TagType.DoAction, actions};
}

export function parseDoInitAction(byteStream: ReadableByteStream): tags.DoInitAction {
  const spriteId: Uint16 = byteStream.readUint16LE();
  const actions: Uint8Array = Uint8Array.from(byteStream.tailBytes());
  return {type: TagType.DoInitAction, spriteId, actions};
}

export function parseEnableDebugger(_byteStream: ReadableByteStream): tags.EnableDebugger {
  throw new Incident("NotImplemented", "parseEnableDebugger");
}

export function parseEnableDebugger2(_byteStream: ReadableByteStream): tags.EnableDebugger {
  throw new Incident("NotImplemented", "parseEnableDebugger2");
}

export function parseEnableTelemetry(_byteStream: ReadableByteStream): never {
  throw new Incident("NotImplemented", "parseEnableTelemetry");
}

export function parseExportAssets(byteStream: ReadableByteStream): tags.ExportAssets {
  const assetCount: UintSize = byteStream.readUint16LE();
  const assets: NamedId[] = [];
  for (let i: UintSize = 0; i < assetCount; i++) {
    const id: Uint16 = byteStream.readUint16LE();
    const name: string = byteStream.readCString();
    assets.push({id, name});
  }
  return {
    type: TagType.ExportAssets,
    assets,
  };
}

export function parseFileAttributes(byteStream: ReadableByteStream): tags.FileAttributes {
  const flags: Uint8 = byteStream.readUint32LE();

  return {
    type: TagType.FileAttributes,
    useNetwork: (flags & (1 << 0)) !== 0,
    useRelativeUrls: (flags & (1 << 1)) !== 0,
    noCrossDomainCaching: (flags & (1 << 2)) !== 0,
    useAs3: (flags & (1 << 3)) !== 0,
    hasMetadata: (flags & (1 << 4)) !== 0,
    useGpu: (flags & (1 << 5)) !== 0,
    useDirectBlit: (flags & (1 << 6)) !== 0,
  };
}

export function parseFrameLabel(byteStream: ReadableByteStream): tags.FrameLabel {
  const name: string = byteStream.readCString();
  // The isAnchor was introduced in SWF6, check version before reading?
  const isAnchor: boolean = byteStream.available() > 0 && byteStream.readUint8() !== 0;
  return {
    type: TagType.FrameLabel,
    name,
    isAnchor,
  };
}

export function parseImportAssets(byteStream: ReadableByteStream): tags.ImportAssets {
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

export function parseImportAssets2(byteStream: ReadableByteStream): tags.ImportAssets {
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

export function parseMetadata(byteStream: ReadableByteStream): tags.Metadata {
  return {type: TagType.Metadata, metadata: byteStream.readCString()};
}

export function parsePlaceObject(byteStream: ReadableByteStream): tags.PlaceObject {
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
    isUpdate: false,
    depth,
    characterId,
    matrix,
    colorTransform,
    ratio: undefined,
    name: undefined,
    filters: undefined,
    blendMode: undefined,
    visible: undefined,
    backgroundColor: undefined,
    clipActions: undefined,
  };
}

export function parsePlaceObject2(byteStream: ReadableByteStream, swfVersion: UintSize): tags.PlaceObject {
  const flags: Uint16 = byteStream.readUint8();
  const isUpdate: boolean = (flags & (1 << 0)) !== 0;
  const hasCharacterId: boolean = (flags & (1 << 1)) !== 0;
  const hasMatrix: boolean = (flags & (1 << 2)) !== 0;
  const hasColorTransform: boolean = (flags & (1 << 3)) !== 0;
  const hasRatio: boolean = (flags & (1 << 4)) !== 0;
  const hasName: boolean = (flags & (1 << 5)) !== 0;
  const hasClipDepth: boolean = (flags & (1 << 6)) !== 0;
  const hasClipActions: boolean = (flags & (1 << 7)) !== 0;
  const depth: Uint16 = byteStream.readUint16LE();
  const characterId: Uint16 | undefined = hasCharacterId ? byteStream.readUint16LE() : undefined;
  const matrix: Matrix | undefined = hasMatrix ? parseMatrix(byteStream) : undefined;
  const colorTransform: ColorTransformWithAlpha | undefined = hasColorTransform
    ? parseColorTransformWithAlpha(byteStream)
    : undefined;
  const ratio: Uint16 | undefined = hasRatio ? byteStream.readUint16LE() : undefined;
  const name: string | undefined = hasName ? byteStream.readCString() : undefined;
  const clipDepth: Uint16 | undefined = hasClipDepth ? byteStream.readUint16LE() : undefined;
  const clipActions: ClipAction[] | undefined = hasClipActions
    ? parseClipActionString(byteStream, swfVersion >= 6)
    : undefined;

  return {
    type: TagType.PlaceObject,
    isUpdate,
    depth,
    characterId,
    matrix,
    colorTransform,
    ratio,
    name,
    clipDepth,
    filters: undefined,
    blendMode: undefined,
    visible: undefined,
    backgroundColor: undefined,
    clipActions,
  };
}

export function parsePlaceObject3(byteStream: ReadableByteStream, swfVersion: UintSize): tags.PlaceObject {
  const flags: Uint16 = byteStream.readUint16LE();
  const isUpdate: boolean = (flags & (1 << 0)) !== 0;
  const hasCharacterId: boolean = (flags & (1 << 1)) !== 0;
  const hasMatrix: boolean = (flags & (1 << 2)) !== 0;
  const hasColorTransform: boolean = (flags & (1 << 3)) !== 0;
  const hasRatio: boolean = (flags & (1 << 4)) !== 0;
  const hasName: boolean = (flags & (1 << 5)) !== 0;
  const hasClipDepth: boolean = (flags & (1 << 6)) !== 0;
  const hasClipActions: boolean = (flags & (1 << 7)) !== 0;
  const hasFilters: boolean = (flags & (1 << 8)) !== 0;
  const hasBlendMode: boolean = (flags & (1 << 9)) !== 0;
  const hasCacheHint: boolean = (flags & (1 << 10)) !== 0;
  const hasClassName: boolean = (flags & (1 << 11)) !== 0;
  const hasImage: boolean = (flags & (1 << 12)) !== 0;
  const hasVisibility: boolean = (flags & (1 << 13)) !== 0;
  // TODO: Check whether this should rather be `hasOpaqueBackground`
  const hasBackgroundColor: boolean = (flags & (1 << 14)) !== 0;
  // Skip bit 15
  const depth: Uint16 = byteStream.readUint16LE();
  const className: string | undefined = hasClassName || (hasImage && hasCharacterId)
    ? byteStream.readCString()
    : undefined;
  const characterId: Uint16 | undefined = hasCharacterId ? byteStream.readUint16LE() : undefined;
  const matrix: Matrix | undefined = hasMatrix ? parseMatrix(byteStream) : undefined;
  const colorTransform: ColorTransformWithAlpha | undefined = hasColorTransform
    ? parseColorTransformWithAlpha(byteStream)
    : undefined;
  const ratio: Uint16 | undefined = hasRatio ? byteStream.readUint16LE() : undefined;
  const name: string | undefined = hasName ? byteStream.readCString() : undefined;
  const clipDepth: Uint16 | undefined = hasClipDepth ? byteStream.readUint16LE() : undefined;
  const filters: Filter[] | undefined = hasFilters ? parseFilterList(byteStream) : undefined;
  const blendMode: BlendMode | undefined = hasBlendMode ? parseBlendMode(byteStream) : undefined;
  const useBitmapCache: boolean | undefined = hasCacheHint ? byteStream.readUint8() !== 0 : undefined;
  const isVisible: boolean | undefined = hasVisibility ? byteStream.readUint8() !== 0 : undefined;
  // This does not match the spec, see Shumway
  // https://github.com/mozilla/shumway/blob/16451d8836fa85f4b16eeda8b4bda2fa9e2b22b0/src/swf/parser/module.ts#L158
  // TODO(demurgos): Check if it is RGBA or ARGB
  const backgroundColor: StraightSRgba8 | undefined = hasBackgroundColor ? parseStraightSRgba8(byteStream) : undefined;

  const clipActions: ClipAction[] | undefined = hasClipActions
    ? parseClipActionString(byteStream, swfVersion >= 6)
    : undefined;

  return {
    type: TagType.PlaceObject,
    isUpdate,
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

export function parseProtect(byteStream: ReadableByteStream): tags.Protect {
  const password: string = parseBlockCString(byteStream, byteStream.available());
  return {type: TagType.Protect, password};
}

export function parseRemoveObject(byteStream: ReadableByteStream): tags.RemoveObject {
  const characterId: Uint16 = byteStream.readUint16LE();
  const depth: Uint16 = byteStream.readUint16LE();
  return {type: TagType.RemoveObject, characterId, depth};
}

export function parseRemoveObject2(byteStream: ReadableByteStream): tags.RemoveObject {
  const depth: Uint16 = byteStream.readUint16LE();
  return {type: TagType.RemoveObject, depth};
}

export function parseScriptLimits(byteStream: ReadableByteStream): tags.ScriptLimits {
  const maxRecursionDepth: Uint16 = byteStream.readUint16LE();
  const scriptTimeout: Uint16 = byteStream.readUint16LE();
  return {type: TagType.ScriptLimits, maxRecursionDepth, scriptTimeout};
}

export function parseSetBackgroundColor(byteStream: ReadableByteStream): tags.SetBackgroundColor {
  return {type: TagType.SetBackgroundColor, color: parseSRgb8(byteStream)};
}

export function parseSetTabIndex(byteStream: ReadableByteStream): tags.SetTabIndex {
  const depth: Uint16 = byteStream.readUint16LE();
  const index: Uint16 = byteStream.readUint16LE();
  return {type: TagType.SetTabIndex, depth, index};
}

export function parseSoundStreamBlock(byteStream: ReadableByteStream): tags.SoundStreamBlock {
  const data: Uint8Array = byteStream.tailBytes();
  return {type: TagType.SoundStreamBlock, data};
}

export function parseSoundStreamHead(byteStream: ReadableByteStream): tags.SoundStreamHead {
  // TODO: Check streamFormat and streamSoundSize?
  return parseSoundStreamHeadAny(byteStream);
}

export function parseSoundStreamHead2(byteStream: ReadableByteStream): tags.SoundStreamHead {
  return parseSoundStreamHeadAny(byteStream);
}

export function parseSoundStreamHeadAny(byteStream: ReadableByteStream): tags.SoundStreamHead {
  const flags: Uint8 = byteStream.readUint16LE();
  const playbackSoundType: SoundType = (flags & (1 << 0)) !== 0 ? SoundType.Stereo : SoundType.Mono;
  const playbackSoundSize: SoundSize = (flags & (1 << 1)) !== 0 ? 16 : 8;
  const playbackSoundRate: SoundRate = getSoundRateFromCode(((flags >>> 2) & 0b11) as Uint2);
  // Bits [4,7] are reserved
  const streamSoundType: SoundType = (flags & (1 << 8)) !== 0 ? SoundType.Stereo : SoundType.Mono;
  let streamSoundSize: SoundSize = (flags & (1 << 9)) !== 0 ? 16 : 8;
  const streamSoundRate: SoundRate = getSoundRateFromCode(((flags >>> 10) & 0b11) as Uint2);
  const streamFormat: AudioCodingFormat = getAudioCodingFormatFromCode(((flags >>> 12) & 0b1111) as Uint4);
  if (!isUncompressedAudioCodingFormat(streamFormat)) {
    streamSoundSize = 16;
  }

  const streamSampleCount: Uint16 = byteStream.readUint16LE();
  const latencySeek: Sint16 | undefined = streamFormat === AudioCodingFormat.Mp3
    ? byteStream.readSint16LE()
    : undefined;

  return {
    type: TagType.SoundStreamHead,
    playbackSoundType,
    playbackSoundSize,
    playbackSoundRate,
    streamSoundType,
    streamSoundSize,
    streamSoundRate,
    streamFormat,
    streamSampleCount,
    latencySeek,
  };
}

export function parseStartSound(byteStream: ReadableByteStream): tags.StartSound {
  const soundId: Uint16 = byteStream.readUint16LE();
  const soundInfo: SoundInfo = parseSoundInfo(byteStream);
  return {type: TagType.StartSound, soundId, soundInfo};
}

export function parseStartSound2(byteStream: ReadableByteStream): tags.StartSound2 {
  const soundClassName: string = byteStream.readCString();
  const soundInfo: SoundInfo = parseSoundInfo(byteStream);
  return {type: TagType.StartSound2, soundClassName, soundInfo};
}

export function parseSymbolClass(byteStream: ReadableByteStream): tags.SymbolClass {
  const symbolCount: UintSize = byteStream.readUint16LE();
  const symbols: NamedId[] = [];
  for (let i: UintSize = 0; i < symbolCount; i++) {
    const id: Uint16 = byteStream.readUint16LE();
    const name: string = byteStream.readCString();
    symbols.push({id, name});
  }
  return {
    type: TagType.SymbolClass,
    symbols,
  };
}

export function parseVideoFrame(byteStream: ReadableByteStream): tags.VideoFrame {
  const videoId: Uint16 = byteStream.readUint16LE();
  const frame: Uint16 = byteStream.readUint16LE();
  const packet: Uint8Array = Uint8Array.from(byteStream.tailBytes());
  return {type: TagType.VideoFrame, videoId, frame, packet};
}
