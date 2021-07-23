import { ReadableBitStream, ReadableByteStream, ReadableStream } from "@open-flash/stream";
import incident from "incident";
import { Float32, Sint16, Uint2, Uint3, Uint4, Uint8, Uint16, Uint32, UintSize } from "semantic-types";
import { BlendMode } from "swf-types/blend-mode";
import { ButtonCondAction } from "swf-types/button/button-cond-action";
import { ButtonRecord } from "swf-types/button/button-record";
import { ButtonSound } from "swf-types/button/button-sound";
import { ClipAction } from "swf-types/clip-action";
import { ColorTransformWithAlpha } from "swf-types/color-transform-with-alpha";
import { ColorTransform } from "swf-types/color-transform";
import { AbcHeader } from "swf-types/control/abc-header";
import { Label } from "swf-types/control/label";
import { Scene } from "swf-types/control/scene";
import { Filter } from "swf-types/filter";
import { Sfixed8P8 } from "swf-types/fixed-point/sfixed8p8";
import { Glyph } from "swf-types/glyph";
import { ImageType } from "swf-types/image-type";
import { LanguageCode } from "swf-types/language-code";
import { Matrix } from "swf-types/matrix";
import { MorphShape } from "swf-types/morph-shape";
import { NamedId } from "swf-types/named-id";
import { Rect } from "swf-types/rect";
import { Shape } from "swf-types/shape";
import { AudioCodingFormat } from "swf-types/sound/audio-coding-format";
import { SoundInfo } from "swf-types/sound/sound-info";
import { SoundRate } from "swf-types/sound/sound-rate";
import { SoundSize } from "swf-types/sound/sound-size";
import { SoundType } from "swf-types/sound/sound-type";
import { SpriteTag } from "swf-types/sprite-tag";
import { StraightSRgba8 } from "swf-types/straight-s-rgba8";
import { TagHeader } from "swf-types/tag-header";
import { Tag } from "swf-types/tag";
import { TagType } from "swf-types/tags/_type";
import * as tags from "swf-types/tags/index";
import { CsmTableHint } from "swf-types/text/csm-table-hint";
import { EmSquareSize } from "swf-types/text/em-square-size";
import { FontAlignmentZone } from "swf-types/text/font-alignment-zone";
import { FontLayout } from "swf-types/text/font-layout";
import { GridFitting } from "swf-types/text/grid-fitting";
import { TextAlignment } from "swf-types/text/text-alignment";
import { TextRecord } from "swf-types/text/text-record";
import { TextRenderer } from "swf-types/text/text-renderer";
import { VideoCodec } from "swf-types/video/video-codec";
import { VideoDeblocking } from "swf-types/video/video-deblocking";

import { createIncompleteTagHeaderError } from "../errors/incomplete-tag-header.js";
import { createIncompleteTagError } from "../errors/incomplete-tag.js";
import {
  parseBlockCString,
  parseColorTransform,
  parseColorTransformWithAlpha,
  parseMatrix,
  parseRect,
  parseSRgb8,
  parseStraightSRgba8,
} from "./basic-data-types.js";
import { ButtonVersion, parseButton2CondActionString, parseButtonRecordString, parseButtonSound } from "./button.js";
import { parseBlendMode, parseClipActionString, parseFilterList } from "./display.js";
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
} from "./image.js";
import { MorphShapeVersion, parseMorphShape } from "./morph-shape.js";
import { parseGlyph, parseShape, ShapeVersion } from "./shape.js";
import {
  getAudioCodingFormatFromCode,
  getSoundRateFromCode,
  isUncompressedAudioCodingFormat,
  parseSoundInfo,
} from "./sound.js";
import {
  FontInfoVersion,
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
} from "./text.js";
import { getVideoDeblockingFromCode, parseVideoCodec } from "./video.js";

/**
 * Read tags until the end of the stream or "end-of-tags".
 */
export function parseTagBlockString(byteStream: ReadableByteStream, swfVersion: Uint8): Tag[] {
  const tags: Tag[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const tag: Tag | undefined = parseTag(byteStream, swfVersion);
    if (tag === undefined) {
      break;
    }
    tags.push(tag);
  }
  return tags;
}

/**
 * Parses the next tag in the stream, without failure.
 *
 * This function never throws.
 * If there is not enough data to parse the tag header or consume the tag body, returns a `Raw` tag.
 *
 * @param byteStream Byte stream to read, the read position will be updated.
 * @param swfVersion SWF version to use when parsing the tag.
 * @returns `undefined` if the `EndOfTag` is found, otherwise the `Tag` value.
 */
export function parseTag(byteStream: ReadableByteStream, swfVersion: Uint8): Tag | undefined {
  if (byteStream.available() === 0) {
    return undefined;
  }
  try {
    return tryParseTag(byteStream, swfVersion);
  } catch (e) {
    if (e.name === "IncompleteTagHeaderError" || e.name === "IncompleteTagError") {
      const data: Uint8Array = byteStream.tailBytes();
      return {type: TagType.Raw, data};
    } else {
      // Unexpected error
      throw e;
    }
  }
}

/**
 * Parses the next tag in the stream, with failure.
 *
 * This function only throws if there is if there is not enough data to parse the tag header or
 * consume the tag body.
 *
 * @param byteStream Byte stream to read, the read position will be updated.
 * @param swfVersion SWF version to use when parsing the tag.
 * @returns `undefined` if the `EndOfTag` is found, otherwise the `Tag` value.
 * @throws IncompleteTagHeaderError If there is not enough data available to parse the header.
 * @throws IncompleteTagError If there is not enough data available to parse the tag (header + body).
 */
export function tryParseTag(byteStream: ReadableByteStream, swfVersion: Uint8): Tag | undefined {
  const basePos: UintSize = byteStream.bytePos;
  if (byteStream.available() === 0) {
    return undefined;
  }

  // Let `IncompleteTagHeaderError` bubble
  const header: TagHeader = parseTagHeader(byteStream);

  // `EndOfTags`
  if (header.code === 0) {
    return undefined;
  }

  let bodyStream: ReadableByteStream;
  try {
    bodyStream = byteStream.take(header.length);
  } catch (e) {
    const headSize: UintSize = byteStream.bytePos - basePos;
    const needed: UintSize = headSize + header.length;
    byteStream.bytePos = basePos;
    const available: UintSize = byteStream.available();
    throw createIncompleteTagError(available, needed);
  }

  // Always succeeds
  return parseTagBody(bodyStream, header.code, swfVersion);
}

/**
 * Parses a (possibly incomplete) tag header.
 *
 * @param byteStream Byte stream to read, the read position will be updated.
 * @returns Parsed tag header.
 * @throws IncompleteTagHeaderError If there is not enough data available.
 */
function parseTagHeader(byteStream: ReadableByteStream): TagHeader {
  const basePos: UintSize = byteStream.bytePos;

  // TODO: Check if we should bail-out on `NUL` first byte.

  if (byteStream.available() < 2) {
    byteStream.bytePos = basePos;
    throw createIncompleteTagHeaderError();
  }

  const codeAndLength: Uint16 = byteStream.readUint16LE();
  const code: Uint16 = codeAndLength >>> 6;
  const maxShortBodySize: number = (1 << 6) - 1;
  const shortBodySize: number = codeAndLength & maxShortBodySize;

  if (shortBodySize === maxShortBodySize) {
    if (byteStream.available() < 4) {
      byteStream.bytePos = basePos;
      throw createIncompleteTagHeaderError();
    }
    const bodySize: Uint32 = byteStream.readUint32LE();
    return {code, length: bodySize};
  } else {
    return {code, length: shortBodySize};
  }
}

/**
 * Parses a tag body.
 *
 * This function never throws.
 * Unknown codes or invalid tag bodies produce a `RawBody` tag.
 *
 * @param byteStream Byte stream to read, the read position will be updated.
 * @param tagCode Raw code of the tag.
 * @param swfVersion SWF version to use.
 * @returns Parsed tag body
 */
// tslint:disable-next-line:cyclomatic-complexity
function parseTagBody(byteStream: ReadableByteStream, tagCode: Uint8, swfVersion: Uint8): Tag {
  const basePos: UintSize = byteStream.bytePos;
  try {
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
        return parseDefineBits(byteStream, swfVersion);
      case 7:
        return parseDefineButton(byteStream);
      case 8:
        return parseDefineJpegTables(byteStream, swfVersion);
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
        return parseDefineBitsJpeg2(byteStream, swfVersion);
      case 22:
        return parseDefineShape2(byteStream);
      case 23:
        return parseDefineButtonColorTransform(byteStream);
      case 24:
        return parseProtect(byteStream);
      case 25:
        return {type: TagType.EnablePostscript};
      case 26:
        return parsePlaceObject2(byteStream, swfVersion);
      case 28:
        return parseRemoveObject2(byteStream);
      case 32:
        return parseDefineShape3(byteStream);
      case 33:
        return parseDefineText2(byteStream);
      case 34:
        return parseDefineButton2(byteStream);
      case 35:
        return parseDefineBitsJpeg3(byteStream, swfVersion);
      case 36:
        return parseDefineBitsLossless2(byteStream);
      case 37:
        return parseDefineEditText(byteStream);
      case 39:
        return parseDefineSprite(byteStream, swfVersion);
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
        return parsePlaceObject3(byteStream, swfVersion);
      case 71:
        return parseImportAssets2(byteStream);
      case 72:
        return parseDoAbc(byteStream, false);
      case 73:
        return parseDefineFontAlignZones(byteStream);
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
        return parseDoAbc(byteStream, true);
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
        return parseDefineBitsJpeg4(byteStream);
      case 91:
        return parseDefineFont4(byteStream);
      case 93:
        return parseEnableTelemetry(byteStream);
      default: {
        throw new incident.Incident("UnknownTagCode", {code: tagCode});
      }
    }
  } catch (e) {
    byteStream.bytePos = basePos;
    const data: Uint8Array = byteStream.tailBytes();
    return {type: TagType.RawBody, code: tagCode, data};
  }
}

export function parseCsmTextSettings(byteStream: ReadableByteStream): tags.CsmTextSettings {
  const textId: Uint16 = byteStream.readUint16LE();
  const bitStream: ReadableBitStream = byteStream.asBitStream();
  const renderer: TextRenderer = parseTextRendererBits(bitStream);
  const fitting: GridFitting = parseGridFittingBits(bitStream);
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
    throw new incident.Incident("UnknownBitmapType");
  }

  return {type: TagType.DefineBitmap, id, ...imageDimensions, mediaType: "image/x-swf-partial-jpeg", data};
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
    throw new incident.Incident("UnknownBitmapType");
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
      mediaType = "image/x-swf-jpeg3";
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
    throw new incident.Incident("UnknownBitmapType");
  }

  return {type: TagType.DefineBitmap, id, ...imageDimensions, mediaType, data};
}

// TODO: Merge defineBitsJpegX functions into defineBitsJpegAny
export function parseDefineBitsJpeg4(byteStream: ReadableByteStream): tags.DefineBitmap {
  const id: Uint16 = byteStream.readUint16LE();

  const bytePos: UintSize = byteStream.bytePos;

  const dataLen: Uint32 = byteStream.readUint32LE();
  byteStream.skip(2); // Skip deblock
  let data: Uint8Array = byteStream.takeBytes(dataLen);
  let mediaType: ImageType;
  let imageDimensions: ImageDimensions;

  if (testImageStart(data, JPEG_START)) {
    imageDimensions = getJpegImageDimensions(new ReadableStream(data));
    mediaType = "image/x-swf-jpeg4";
    byteStream.bytePos = bytePos;
    data = byteStream.tailBytes();
  } else if (testImageStart(data, PNG_START)) {
    mediaType = "image/png";
    imageDimensions = getPngImageDimensions(new ReadableStream(data));
  } else if (testImageStart(data, GIF_START)) {
    mediaType = "image/gif";
    imageDimensions = getGifImageDimensions(new ReadableStream(data));
  } else {
    throw new incident.Incident("UnknownBitmapType");
  }

  return {type: TagType.DefineBitmap, id, ...imageDimensions, mediaType, data};
}

export function parseDefineBitsLossless(byteStream: ReadableByteStream): tags.DefineBitmap {
  return parseDefineBitsLosslessAny(byteStream, "image/x-swf-lossless1");
}

export function parseDefineBitsLossless2(byteStream: ReadableByteStream): tags.DefineBitmap {
  return parseDefineBitsLosslessAny(byteStream, "image/x-swf-lossless2");
}

function parseDefineBitsLosslessAny(
  byteStream: ReadableByteStream,
  mediaType: "image/x-swf-lossless1" | "image/x-swf-lossless2",
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

  const records: ButtonRecord[] = parseButtonRecordString(byteStream, ButtonVersion.Button1);
  const actions: Uint8Array = Uint8Array.from(byteStream.tailBytes());
  const condAction: ButtonCondAction = {actions};

  return {type: TagType.DefineButton, id, trackAsMenu, records, actions: [condAction]};
}

export function parseDefineButton2(byteStream: ReadableByteStream): tags.DefineButton {
  const id: Uint16 = byteStream.readUint16LE();
  const flags: Uint8 = byteStream.readUint8();
  const trackAsMenu: boolean = (flags & (1 << 0)) !== 0;
  // Skip bits [1, 7]
  const pos: UintSize = byteStream.bytePos;
  const actionOffset: Uint16 = byteStream.readUint16LE();
  const records: ButtonRecord[] = parseButtonRecordString(byteStream, ButtonVersion.Button2);
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
  return {type: TagType.DefineButton, id, trackAsMenu, records, actions};
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
  const fontClass: string | undefined = hasFontClass ? byteStream.readNulUtf8() : undefined;
  const fontSize: Uint16 | undefined = (hasFont || hasFontClass) ? byteStream.readUint16LE() : undefined;
  const color: StraightSRgba8 | undefined = hasColor ? parseStraightSRgba8(byteStream) : undefined;
  const maxLength: UintSize | undefined = hasMaxLength ? byteStream.readUint16LE() : undefined;
  const align: TextAlignment = hasLayout ? parseTextAlignment(byteStream) : TextAlignment.Left;
  const marginLeft: Uint16 = hasLayout ? byteStream.readUint16LE() : 0;
  const marginRight: Uint16 = hasLayout ? byteStream.readUint16LE() : 0;
  const indent: Uint16 = hasLayout ? byteStream.readUint16LE() : 0;
  const leading: Sint16 = hasLayout ? byteStream.readSint16LE() : 0;
  const rawVariableName: string = byteStream.readNulUtf8();
  const variableName: string | undefined = rawVariableName.length > 0 ? rawVariableName : undefined;
  const text: string | undefined = hasText ? byteStream.readNulUtf8() : undefined;

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
    const startLen: UintSize = available;

    const firstOffset: Uint16 = byteStream.readUint16LE();
    // Dividing by 2 since each glyph offset takes 2 bytes.
    // TODO: Assert that `offsetToFirstGlyph` is even
    const glyphCount: UintSize = Math.floor(firstOffset / 2);
    const offsets: UintSize[] = [firstOffset];
    for (let i: UintSize = 1; i < glyphCount; i++) {
      offsets.push(byteStream.readUint16LE());
    }
    for (let i: number = 0; i < offsets.length; i++) {
      const startOffset: UintSize = offsets[i];
      const endOffset: UintSize = (i + 1) < offsets.length ? offsets[i + 1] : startLen;
      if (endOffset < startOffset) {
        throw new incident.Incident("InvalidGlyphFontOffset", {startOffset, endOffset});
      }
      const glyphSize: UintSize = endOffset - startOffset;
      byteStream.bytePos = startPos + startOffset;
      const glyphStream: ReadableByteStream = byteStream.take(glyphSize);
      // TODO: special mode when parsing the shape: the first changeStyle is
      //       forced to have stateFillStyle0 and stateFill0
      glyphs.push(parseGlyph(glyphStream));
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
  const layout: FontLayout | undefined = hasLayout ? parseFontLayout(byteStream, glyphCount) : undefined;

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

  const fontName: string = byteStream.readNulUtf8();

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

export function parseDefineFontAlignZones(byteStream: ReadableByteStream): tags.DefineFontAlignZones {
  const fontId: Uint16 = byteStream.readUint16LE();
  const bitStream: ReadableBitStream = byteStream.asBitStream();
  const csmTableHint: CsmTableHint = parseCsmTableHintBits(bitStream);
  bitStream.align();
  const zones: FontAlignmentZone[] = [];
  while (byteStream.available() > 0) {
    zones.push(parseFontAlignmentZone(byteStream));
  }
  return {type: TagType.DefineFontAlignZones, fontId, csmTableHint, zones};
}

export function parseDefineFontInfo(byteStream: ReadableByteStream): tags.DefineFontInfo {
  return parseDefineFontInfoAny(byteStream, FontInfoVersion.FontInfo1);
}

export function parseDefineFontInfo2(byteStream: ReadableByteStream): tags.DefineFontInfo {
  return parseDefineFontInfoAny(byteStream, FontInfoVersion.FontInfo2);
}

function parseDefineFontInfoAny(byteStream: ReadableByteStream, version: FontInfoVersion): tags.DefineFontInfo {
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
  // Bits [6, 7] are reserved

  // const emSquareSize: EmSquareSize = 1024;

  const language: LanguageCode = version >= FontInfoVersion.FontInfo2
    ? parseLanguageCode(byteStream)
    : LanguageCode.Auto;

  // if (version >= FontInfoVersion.FontInfo2) {
  //   if (!(useWideCodes && !isAnsi && !isShiftJis)) {
  //     throw new Error("AssertionError: Invalid flags");
  //   }
  // }

  const codeUnits: Uint16[] = [];
  if (useWideCodes) {
    // TODO: Handle odd values.
    const codeUnitCount: UintSize = Math.floor(byteStream.available() / 2);
    for (let i: UintSize = 0; i < codeUnitCount; i++) {
      codeUnits.push(byteStream.readUint16LE());
    }
  } else {
    const codeUnitCount: UintSize = byteStream.available();
    for (let i: UintSize = 0; i < codeUnitCount; i++) {
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

export function parseDefineFontName(byteStream: ReadableByteStream): tags.DefineFontName {
  const fontId: Uint16 = byteStream.readUint16LE();
  const name: string = byteStream.readNulUtf8();
  const copyright: string = byteStream.readNulUtf8();
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
    const name: string = byteStream.readNulUtf8();
    scenes.push({offset, name});
  }
  const labelCount: Uint32 = byteStream.readUint32Leb128();
  const labels: Label[] = [];
  for (let i: number = 0; i < labelCount; i++) {
    const frame: number = byteStream.readUint32Leb128();
    const name: string = byteStream.readNulUtf8();
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

  // TODO: Update swf-types/lib to use this order for the properties
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

export function parseDefineSprite(byteStream: ReadableByteStream, swfVersion: Uint8): tags.DefineSprite {
  const id: Uint16 = byteStream.readUint16LE();
  const frameCount: UintSize = byteStream.readUint16LE();
  const tags: Tag[] = parseTagBlockString(byteStream, swfVersion);
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
  const records: TextRecord[] = parseTextRecordString(byteStream, hasAlpha, indexBits, advanceBits);
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
  // Bits [4, 7] are reserved
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

export function parseDoAbc(byteStream: ReadableByteStream, hasHeader: boolean): tags.DoAbc {
  let header: AbcHeader | undefined;
  if (hasHeader) {
    const flags: Uint32 = byteStream.readUint32LE();
    const name: string = byteStream.readNulUtf8();
    header = {flags, name};
  }
  const data: Uint8Array = Uint8Array.from(byteStream.tailBytes());
  return {type: TagType.DoAbc, header, data};
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

export function parseEnableDebugger(byteStream: ReadableByteStream): tags.EnableDebugger {
  const password: string = byteStream.readNulUtf8();
  return {type: TagType.EnableDebugger, password};
}

export function parseEnableDebugger2(byteStream: ReadableByteStream): tags.EnableDebugger {
  byteStream.skip(2);
  const password: string = byteStream.readNulUtf8();
  return {type: TagType.EnableDebugger, password};
}

export function parseEnableTelemetry(byteStream: ReadableByteStream): tags.Telemetry {
  byteStream.skip(2);
  const password: Uint8Array | undefined = byteStream.available() >= 32
    ? byteStream.takeBytes(32)
    : undefined;
  return {type: TagType.Telemetry, password};
}

export function parseExportAssets(byteStream: ReadableByteStream): tags.ExportAssets {
  const assetCount: UintSize = byteStream.readUint16LE();
  const assets: NamedId[] = [];
  for (let i: UintSize = 0; i < assetCount; i++) {
    const id: Uint16 = byteStream.readUint16LE();
    const name: string = byteStream.readNulUtf8();
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
  const name: string = byteStream.readNulUtf8();
  // The isAnchor was introduced in SWF6, check version before reading?
  const isAnchor: boolean = byteStream.available() > 0 && byteStream.readUint8() !== 0;
  return {
    type: TagType.FrameLabel,
    name,
    isAnchor,
  };
}

export function parseImportAssets(byteStream: ReadableByteStream): tags.ImportAssets {
  const url: string = byteStream.readNulUtf8();
  const assetCount: UintSize = byteStream.readUint16LE();
  const assets: NamedId[] = [];
  for (let i: number = 0; i < assetCount; i++) {
    const id: Uint16 = byteStream.readUint16LE();
    const name: string = byteStream.readNulUtf8();
    assets.push({id, name});
  }
  return {
    type: TagType.ImportAssets,
    url,
    assets,
  };
}

export function parseImportAssets2(byteStream: ReadableByteStream): tags.ImportAssets {
  const url: string = byteStream.readNulUtf8();
  byteStream.skip(2);
  const assetCount: UintSize = byteStream.readUint16LE();
  const assets: NamedId[] = [];
  for (let i: number = 0; i < assetCount; i++) {
    const id: Uint16 = byteStream.readUint16LE();
    const name: string = byteStream.readNulUtf8();
    assets.push({id, name});
  }
  return {
    type: TagType.ImportAssets,
    url,
    assets,
  };
}

export function parseMetadata(byteStream: ReadableByteStream): tags.Metadata {
  return {type: TagType.Metadata, metadata: byteStream.readNulUtf8()};
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
  const name: string | undefined = hasName ? byteStream.readNulUtf8() : undefined;
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
    ? byteStream.readNulUtf8()
    : undefined;
  const characterId: Uint16 | undefined = hasCharacterId ? byteStream.readUint16LE() : undefined;
  const matrix: Matrix | undefined = hasMatrix ? parseMatrix(byteStream) : undefined;
  const colorTransform: ColorTransformWithAlpha | undefined = hasColorTransform
    ? parseColorTransformWithAlpha(byteStream)
    : undefined;
  const ratio: Uint16 | undefined = hasRatio ? byteStream.readUint16LE() : undefined;
  const name: string | undefined = hasName ? byteStream.readNulUtf8() : undefined;
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
  // Bits [4, 7] are reserved
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
  const soundClassName: string = byteStream.readNulUtf8();
  const soundInfo: SoundInfo = parseSoundInfo(byteStream);
  return {type: TagType.StartSound2, soundClassName, soundInfo};
}

export function parseSymbolClass(byteStream: ReadableByteStream): tags.SymbolClass {
  const symbolCount: UintSize = byteStream.readUint16LE();
  const symbols: NamedId[] = [];
  for (let i: UintSize = 0; i < symbolCount; i++) {
    const id: Uint16 = byteStream.readUint16LE();
    const name: string = byteStream.readNulUtf8();
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
