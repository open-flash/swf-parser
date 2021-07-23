import { ReadableByteStream } from "@open-flash/stream";
import incident from "incident";
import { Float32, Uint4, Uint5, Uint8, Uint32, UintSize } from "semantic-types";
import { BlendMode } from "swf-types/blend-mode";
import { ClipAction } from "swf-types/clip-action";
import { ClipEventFlags } from "swf-types/clip-event-flags";
import { ColorStop } from "swf-types/color-stop";
import { Filter } from "swf-types/filter";
import { FilterType } from "swf-types/filters/_type";
import * as filters from "swf-types/filters/index";
import { Sfixed8P8 } from "swf-types/fixed-point/sfixed8p8";
import { Sfixed16P16 } from "swf-types/fixed-point/sfixed16p16";
import { StraightSRgba8 } from "swf-types/straight-s-rgba8";

import { parseStraightSRgba8 } from "./basic-data-types.js";

export function parseBlendMode(byteStream: ReadableByteStream): BlendMode {
  switch (byteStream.readUint8()) {
    case 0:
    case 1:
      return BlendMode.Normal;
    case 2:
      return BlendMode.Layer;
    case 3:
      return BlendMode.Multiply;
    case 4:
      return BlendMode.Screen;
    case 5:
      return BlendMode.Lighten;
    case 6:
      return BlendMode.Darken;
    case 7:
      return BlendMode.Difference;
    case 8:
      return BlendMode.Add;
    case 9:
      return BlendMode.Subtract;
    case 10:
      return BlendMode.Invert;
    case 11:
      return BlendMode.Alpha;
    case 12:
      return BlendMode.Erase;
    case 13:
      return BlendMode.Overlay;
    case 14:
      return BlendMode.Hardlight;
    default:
      throw new incident.Incident("UnreachableCode");
  }
}

export function parseClipActionString(byteStream: ReadableByteStream, extendedEvents: boolean): ClipAction[] {
  byteStream.skip(2); // Reserved
  byteStream.skip(extendedEvents ? 4 : 2); // All events (union of the events)
  const result: ClipAction[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const savedPos: UintSize = byteStream.bytePos;
    const peek: Uint32 = extendedEvents ? byteStream.readFloat32LE() : byteStream.readUint16LE();
    if (peek === 0) {
      break;
    } else {
      byteStream.bytePos = savedPos;
    }
    result.push(parseClipAction(byteStream, extendedEvents));
  }

  return result;
}

export function parseClipEventFlags(byteStream: ReadableByteStream, extendedEvents: boolean): ClipEventFlags {
  const flags: Uint32 = extendedEvents ? byteStream.readFloat32LE() : byteStream.readUint16LE();

  const load: boolean = (flags & (1 << 0)) !== 0;
  const enterFrame: boolean = (flags & (1 << 1)) !== 0;
  const unload: boolean = (flags & (1 << 2)) !== 0;
  const mouseMove: boolean = (flags & (1 << 3)) !== 0;
  const mouseDown: boolean = (flags & (1 << 4)) !== 0;
  const mouseUp: boolean = (flags & (1 << 5)) !== 0;
  const keyDown: boolean = (flags & (1 << 6)) !== 0;
  const keyUp: boolean = (flags & (1 << 7)) !== 0;
  const data: boolean = (flags & (1 << 8)) !== 0;
  const initialize: boolean = (flags & (1 << 9)) !== 0;
  const press: boolean = (flags & (1 << 10)) !== 0;
  const release: boolean = (flags & (1 << 11)) !== 0;
  const releaseOutside: boolean = (flags & (1 << 12)) !== 0;
  const rollOver: boolean = (flags & (1 << 13)) !== 0;
  const rollOut: boolean = (flags & (1 << 14)) !== 0;
  const dragOver: boolean = (flags & (1 << 15)) !== 0;
  const dragOut: boolean = (flags & (1 << 16)) !== 0;
  const keyPress: boolean = (flags & (1 << 17)) !== 0;
  const construct: boolean = (flags & (1 << 18)) !== 0;

  return {
    load,
    enterFrame,
    unload,
    mouseMove,
    mouseDown,
    mouseUp,
    keyDown,
    keyUp,
    data,
    initialize,
    press,
    release,
    releaseOutside,
    rollOver,
    rollOut,
    dragOver,
    dragOut,
    keyPress,
    construct,
  };
}

export function parseClipAction(byteStream: ReadableByteStream, extendedEvents: boolean): ClipAction {
  const events: ClipEventFlags = parseClipEventFlags(byteStream, extendedEvents);
  let actionsSize: UintSize = byteStream.readUint32LE();
  let keyCode: Uint8 | undefined = undefined;
  if (events.keyPress) {
    keyCode = byteStream.readUint8();
    actionsSize -= 1;
  }
  const actions: Uint8Array = Uint8Array.from(byteStream.takeBytes(actionsSize));
  return {events, keyCode, actions};
}

export function parseFilterList(byteStream: ReadableByteStream): Filter[] {
  const filterCount: UintSize = byteStream.readUint8();
  const result: Filter[] = [];
  for (let i: number = 0; i < filterCount; i++) {
    result.push(parseFilter(byteStream));
  }
  return result;
}

export function parseFilter(byteStream: ReadableByteStream): Filter {
  switch (byteStream.readUint8()) {
    case 0:
      return parseDropShadowFilter(byteStream);
    case 1:
      return parseBlurFilter(byteStream);
    case 2:
      return parseGlowFilter(byteStream);
    case 3:
      return parseBevelFilter(byteStream);
    case 4:
      return parseGradientGlowFilter(byteStream);
    case 5:
      return parseConvolutionFilter(byteStream);
    case 6:
      return parseColorMatrixFilter(byteStream);
    case 7:
      return parseGradientBevelFilter(byteStream);
    default:
      throw new incident.Incident("UnreachableCode");
  }
}

export function parseBevelFilter(byteStream: ReadableByteStream): filters.Bevel {
  const shadowColor: StraightSRgba8 = parseStraightSRgba8(byteStream);
  const highlightColor: StraightSRgba8 = parseStraightSRgba8(byteStream);
  const blurX: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const blurY: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const angle: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const distance: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const strength: Sfixed8P8 = Sfixed8P8.fromEpsilons(byteStream.readSint16LE());
  const flags: Uint8 = byteStream.readUint8();
  const passes: Uint4 = <Uint4> (flags & 0b1111);
  const onTop: boolean = (flags & (1 << 4)) !== 0;
  const compositeSource: boolean = (flags & (1 << 5)) !== 0;
  const knockout: boolean = (flags & (1 << 6)) !== 0;
  const inner: boolean = (flags & (1 << 7)) !== 0;
  return {
    filter: FilterType.Bevel,
    shadowColor,
    highlightColor,
    blurX,
    blurY,
    angle,
    distance,
    strength,
    inner,
    knockout,
    compositeSource,
    onTop,
    passes,
  };
}

export function parseBlurFilter(byteStream: ReadableByteStream): filters.Blur {
  const blurX: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const blurY: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const flags: Uint8 = byteStream.readUint8();
  // Skip bits [0, 2]
  const passes: Uint5 = <Uint5> ((flags >>> 3) & 0x1f);
  return {
    filter: FilterType.Blur,
    blurX,
    blurY,
    passes,
  };
}

export function parseColorMatrixFilter(byteStream: ReadableByteStream): filters.ColorMatrix {
  const matrix: Float32[] = [];
  for (let i: number = 0; i < 20; i++) {
    matrix.push(byteStream.readFloat32LE());
  }
  return {
    filter: FilterType.ColorMatrix,
    matrix,
  };
}

export function parseConvolutionFilter(byteStream: ReadableByteStream): filters.Convolution {
  const matrixWidth: UintSize = byteStream.readUint8();
  const matrixHeight: UintSize = byteStream.readUint8();
  const divisor: Float32 = byteStream.readFloat32LE();
  const bias: Float32 = byteStream.readFloat32LE();
  const matrix: Float32[] = [];
  for (let i: number = 0; i < matrixWidth * matrixHeight; i++) {
    matrix.push(byteStream.readFloat32LE());
  }
  const defaultColor: StraightSRgba8 = parseStraightSRgba8(byteStream);
  const flags: Uint8 = byteStream.readUint8();
  const preserveAlpha: boolean = (flags & (1 << 0)) !== 0;
  const clamp: boolean = (flags & (1 << 1)) !== 0;
  // Skip bits [2, 7]
  return {
    filter: FilterType.Convolution,
    matrixWidth,
    matrixHeight,
    divisor,
    bias,
    matrix,
    defaultColor,
    clamp,
    preserveAlpha,
  };
}

export function parseDropShadowFilter(byteStream: ReadableByteStream): filters.DropShadow {
  const color: StraightSRgba8 = parseStraightSRgba8(byteStream);
  const blurX: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const blurY: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const angle: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const distance: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const strength: Sfixed8P8 = Sfixed8P8.fromEpsilons(byteStream.readSint16LE());
  const flags: Uint8 = byteStream.readUint8();
  const passes: Uint5 = flags & ((1 << 5) - 1);
  const compositeSource: boolean = (flags & (1 << 5)) !== 0;
  const knockout: boolean = (flags & (1 << 6)) !== 0;
  const inner: boolean = (flags & (1 << 7)) !== 0;
  return {
    filter: FilterType.DropShadow,
    color,
    blurX,
    blurY,
    angle,
    distance,
    strength,
    inner,
    knockout,
    compositeSource,
    passes,
  };
}

export function parseGlowFilter(byteStream: ReadableByteStream): filters.Glow {
  const color: StraightSRgba8 = parseStraightSRgba8(byteStream);
  const blurX: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const blurY: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const strength: Sfixed8P8 = Sfixed8P8.fromEpsilons(byteStream.readSint16LE());
  const flags: Uint8 = byteStream.readUint8();
  const passes: Uint5 = flags & ((1 << 5) - 1);
  const compositeSource: boolean = (flags & (1 << 5)) !== 0;
  const knockout: boolean = (flags & (1 << 6)) !== 0;
  const inner: boolean = (flags & (1 << 7)) !== 0;
  return {
    filter: FilterType.Glow,
    color,
    blurX,
    blurY,
    strength,
    inner,
    knockout,
    compositeSource,
    passes,
  };
}

export function parseGradientBevelFilter(byteStream: ReadableByteStream): filters.GradientBevel {
  const colorCount: UintSize = byteStream.readUint8();
  const gradient: ColorStop[] = [];
  for (let i: number = 0; i < colorCount; i++) {
    gradient.push({ratio: 0, color: parseStraightSRgba8(byteStream)});
  }
  for (let i: number = 0; i < colorCount; i++) {
    gradient[i].ratio = byteStream.readUint8();
  }
  const blurX: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const blurY: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const angle: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const distance: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const strength: Sfixed8P8 = Sfixed8P8.fromEpsilons(byteStream.readSint16LE());
  const flags: Uint8 = byteStream.readUint8();
  const passes: Uint4 = <Uint4> (flags & ((1 << 4) - 1));
  const onTop: boolean = (flags & (1 << 4)) !== 0;
  const compositeSource: boolean = (flags & (1 << 5)) !== 0;
  const knockout: boolean = (flags & (1 << 6)) !== 0;
  const inner: boolean = (flags & (1 << 7)) !== 0;
  return {
    filter: FilterType.GradientBevel,
    gradient,
    blurX,
    blurY,
    angle,
    distance,
    strength,
    inner,
    knockout,
    compositeSource,
    onTop,
    passes,
  };
}

export function parseGradientGlowFilter(byteStream: ReadableByteStream): filters.GradientGlow {
  const colorCount: UintSize = byteStream.readUint8();
  const gradient: ColorStop[] = [];
  for (let i: number = 0; i < colorCount; i++) {
    gradient.push({ratio: 0, color: parseStraightSRgba8(byteStream)});
  }
  for (let i: number = 0; i < colorCount; i++) {
    gradient[i].ratio = byteStream.readUint8();
  }
  const blurX: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const blurY: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const angle: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const distance: Sfixed16P16 = Sfixed16P16.fromEpsilons(byteStream.readSint32LE());
  const strength: Sfixed8P8 = Sfixed8P8.fromEpsilons(byteStream.readSint16LE());
  const flags: Uint8 = byteStream.readUint8();
  const passes: Uint4 = <Uint4> (flags & ((1 << 4) - 1));
  const onTop: boolean = (flags & (1 << 4)) !== 0;
  const compositeSource: boolean = (flags & (1 << 5)) !== 0;
  const knockout: boolean = (flags & (1 << 6)) !== 0;
  const inner: boolean = (flags & (1 << 7)) !== 0;
  return {
    filter: FilterType.GradientGlow,
    gradient,
    blurX,
    blurY,
    angle,
    distance,
    strength,
    inner,
    knockout,
    compositeSource,
    onTop,
    passes,
  };
}
