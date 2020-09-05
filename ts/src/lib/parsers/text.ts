import { ReadableBitStream, ReadableByteStream } from "@open-flash/stream";
import incident from "incident";
import { Float16, Sint16, SintSize, Uint8, Uint16, UintSize } from "semantic-types";
import { Glyph } from "swf-types/lib/glyph.js";
import { LanguageCode } from "swf-types/lib/language-code.js";
import { Rect } from "swf-types/lib/rect.js";
import { StraightSRgba8 } from "swf-types/lib/straight-s-rgba8.js";
import {CsmTableHint} from "swf-types/lib/text/csm-table-hint.js";
import { FontAlignmentZoneData} from "swf-types/lib/text/font-alignment-zone-data.js";
import { FontAlignmentZone} from "swf-types/lib/text/font-alignment-zone.js";
import { FontLayout } from "swf-types/lib/text/font-layout.js";
import { GlyphEntry } from "swf-types/lib/text/glyph-entry.js";
import { GridFitting } from "swf-types/lib/text/grid-fitting.js";
import { KerningRecord } from "swf-types/lib/text/kerning-record.js";
import { TextAlignment } from "swf-types/lib/text/text-alignment.js";
import { TextRecord } from "swf-types/lib/text/text-record.js";
import { TextRenderer } from "swf-types/lib/text/text-renderer.js";

import { parseRect, parseSRgb8, parseStraightSRgba8 } from "./basic-data-types.js";
import { parseGlyph } from "./shape.js";

export enum FontVersion {
  // `Font1` is handled apart as `DefineGlyphFont`.
  Font2 = 2,
  Font3 = 3,
  // `Font4` is handled apart as `DefineCffFont`.
}

export enum FontInfoVersion {
  FontInfo1 = 1,
  FontInfo2 = 2,
}

export enum TextVersion {
  Text1 = 1,
  Text2 = 2,
}

export function parseGridFittingBits(bitStream: ReadableBitStream): GridFitting {
  const code: UintSize = bitStream.readUint32Bits(3);
  switch (code) {
    case 0:
      return GridFitting.None;
    case 1:
      return GridFitting.Pixel;
    case 2:
      return GridFitting.SubPixel;
    default:
      throw new incident.Incident("UnreachableCode");
  }
}

export function parseLanguageCode(byteStream: ReadableByteStream): LanguageCode {
  const code: Uint8 = byteStream.readUint8();
  switch (code) {
    case 0:
      return LanguageCode.Auto;
    case 1:
      return LanguageCode.Latin;
    case 2:
      return LanguageCode.Japanese;
    case 3:
      return LanguageCode.Korean;
    case 4:
      return LanguageCode.SimplifiedChinese;
    case 5:
      return LanguageCode.TraditionalChinese;
    default:
      throw new incident.Incident("UnreachableCode");
  }
}

export function parseTextRendererBits(bitStream: ReadableBitStream): TextRenderer {
  const code: UintSize = bitStream.readUint32Bits(2);
  switch (code) {
    case 0:
      return TextRenderer.Normal;
    case 1:
      return TextRenderer.Advanced;
    default:
      throw new incident.Incident("UnreachableCode");
  }
}

export function parseTextRecordString(
  byteStream: ReadableByteStream,
  hasAlpha: boolean,
  indexBits: UintSize,
  advanceBits: UintSize,
): TextRecord[] {
  const result: TextRecord[] = [];
  while (byteStream.peekUint8() !== 0) {
    result.push(parseTextRecord(byteStream, hasAlpha, indexBits, advanceBits));
  }
  byteStream.skip(1); // End of records
  return result;
}

export function parseTextRecord(
  byteStream: ReadableByteStream,
  hasAlpha: boolean,
  indexBits: UintSize,
  advanceBits: UintSize,
): TextRecord {
  const flags: Uint8 = byteStream.readUint8();
  const hasOffsetX: boolean = (flags & (1 << 0)) !== 0;
  const hasOffsetY: boolean = (flags & (1 << 1)) !== 0;
  const hasColor: boolean = (flags & (1 << 2)) !== 0;
  const hasFont: boolean = (flags & (1 << 3)) !== 0;
  // Skip bits [4, 7]

  const fontId: Uint16 | undefined = hasFont ? byteStream.readUint16LE() : undefined;
  let color: StraightSRgba8 | undefined = undefined;
  if (hasColor) {
    color = hasAlpha ? parseStraightSRgba8(byteStream) : {...parseSRgb8(byteStream), a: 255};
  }
  const offsetX: Sint16 = hasOffsetX ? byteStream.readSint16LE() : 0;
  const offsetY: Sint16 = hasOffsetY ? byteStream.readSint16LE() : 0;
  const fontSize: Uint16 | undefined = hasFont ? byteStream.readUint16LE() : undefined;

  const entryCount: UintSize = byteStream.readUint8();
  const bitStream: ReadableBitStream = byteStream.asBitStream();
  const entries: GlyphEntry[] = [];
  for (let i: UintSize = 0; i < entryCount; i++) {
    const index: UintSize = bitStream.readUint32Bits(indexBits);
    const advance: SintSize = bitStream.readSint32Bits(advanceBits);
    entries.push({index, advance});
  }
  bitStream.align();
  return {fontId, color, offsetX, offsetY, fontSize, entries};
}

export function parseCsmTableHintBits(bitStream: ReadableBitStream): CsmTableHint {
  switch (bitStream.readUint16Bits(2)) {
    case 0:
      return CsmTableHint.Thin;
    case 1:
      return CsmTableHint.Medium;
    case 2:
      return CsmTableHint.Thick;
    default:
      throw new incident.Incident("UnreachableCode");
  }
}

export function parseFontAlignmentZone(byteStream: ReadableByteStream): FontAlignmentZone {
  const zoneDataCount: UintSize = byteStream.readUint8();
  // TODO: Assert zoneDataCount === 2
  const data: FontAlignmentZoneData[] = [];
  for (let i: number = 0; i < zoneDataCount; i++) {
    data.push(parseFontAlignmentZoneData(byteStream));
  }
  const flags: Uint8 = byteStream.readUint8();
  const hasX: boolean = (flags & (1 << 0)) !== 0;
  const hasY: boolean = (flags & (1 << 1)) !== 0;
  return {data, hasX, hasY};
}

export function parseFontAlignmentZoneData(byteStream: ReadableByteStream): FontAlignmentZoneData {
  const origin: Float16 = byteStream.readFloat16LE();
  const size: Float16 = byteStream.readFloat16LE();
  return {origin, size};
}

export function parseOffsetGlyphs(
  byteStream: ReadableByteStream,
  glyphCount: UintSize,
  useWideOffset: boolean,
): Glyph[] {
  const startPos: UintSize = byteStream.bytePos;
  const offsets: UintSize[] = new Array(glyphCount + 1);
  for (let i: number = 0; i < offsets.length; i++) {
    offsets[i] = useWideOffset ? byteStream.readUint32LE() : byteStream.readUint16LE();
  }
  const result: Glyph[] = [];
  for (let i: number = 1; i < offsets.length; i++) {
    const length: UintSize = offsets[i] - (byteStream.bytePos - startPos);
    result.push(parseGlyph(byteStream.take(length)));
  }
  return result;
}

export function parseFontLayout(byteStream: ReadableByteStream, glyphCount: UintSize): FontLayout {
  const ascent: Uint16 = byteStream.readUint16LE();
  const descent: Uint16 = byteStream.readUint16LE();
  const leading: Uint16 = byteStream.readUint16LE();
  const advances: Uint16[] = new Array(glyphCount);
  for (let i: number = 0; i < advances.length; i++) {
    advances[i] = byteStream.readUint16LE();
  }
  const bounds: Rect[] = new Array(glyphCount);
  for (let i: number = 0; i < bounds.length; i++) {
    bounds[i] = parseRect(byteStream);
  }
  const kerning: KerningRecord[] = new Array(byteStream.readUint16LE());
  for (let i: number = 0; i < kerning.length; i++) {
    kerning[i] = parseKerningRecord(byteStream);
  }
  return {ascent, descent, leading, advances, bounds, kerning};
}

export function parseKerningRecord(byteStream: ReadableByteStream): KerningRecord {
  const left: Uint16 = byteStream.readUint16LE();
  const right: Uint16 = byteStream.readUint16LE();
  const adjustment: Sint16 = byteStream.readSint16LE();
  return {left, right, adjustment};
}

export function parseTextAlignment(byteStream: ReadableByteStream): TextAlignment {
  switch (byteStream.readUint8()) {
    case 0:
      return TextAlignment.Left;
    case 1:
      return TextAlignment.Right;
    case 2:
      return TextAlignment.Center;
    case 3:
      return TextAlignment.Justify;
    default:
      throw new incident.Incident("UnreachableCode");
  }
}
