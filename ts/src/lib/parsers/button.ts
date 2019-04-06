import { ReadableByteStream } from "@open-flash/stream";
import { Incident } from "incident";
import { Uint16, Uint7, Uint8, UintSize } from "semantic-types";
import { BlendMode } from "swf-tree/blend-mode";
import { ButtonCond } from "swf-tree/button/button-cond";
import { ButtonCondAction } from "swf-tree/button/button-cond-action";
import { ButtonRecord } from "swf-tree/button/button-record";
import { ColorTransformWithAlpha } from "swf-tree/color-transform-with-alpha";
import { Filter } from "swf-tree/filter";
import { Matrix } from "swf-tree/matrix";
import { createIncompleteStreamError } from "../errors/incomplete-stream";
import { parseColorTransformWithAlpha, parseMatrix } from "./basic-data-types";
import { parseBlendMode, parseFilterList } from "./display";

export enum ButtonVersion {
  Button1 = 1,
  Button2 = 2,
}

export function parseButtonRecordString(byteStream: ReadableByteStream, buttonVersion: ButtonVersion): ButtonRecord[] {
  const result: ButtonRecord[] = [];

  while (true) {
    if (byteStream.available() === 0) {
      throw createIncompleteStreamError();
    }
    if (byteStream.peekUint8() === 0) {
      // Consume end of string
      byteStream.skip(1);
      break;
    }
    result.push(parseButtonRecord(byteStream, buttonVersion));
  }

  return result;
}

export function parseButtonRecord(byteStream: ReadableByteStream, buttonVersion: ButtonVersion): ButtonRecord {
  const flags: Uint8 = byteStream.readUint8();
  const stateUp: boolean = (flags & (1 << 0)) !== 0;
  const stateOver: boolean = (flags & (1 << 1)) !== 0;
  const stateDown: boolean = (flags & (1 << 2)) !== 0;
  const stateHitTest: boolean = (flags & (1 << 3)) !== 0;
  const hasFilterList: boolean = (flags & (1 << 4)) !== 0;
  const hasBlendMode: boolean = (flags & (1 << 5)) !== 0;
  // (Skip bits [6, 7])

  const characterId: Uint16 = byteStream.readUint16LE();
  const depth: Uint16 = byteStream.readUint16LE();
  const matrix: Matrix = parseMatrix(byteStream);
  let colorTransform: ColorTransformWithAlpha | undefined = undefined;
  let filters: Filter[] = [];
  let blendMode: BlendMode = BlendMode.Normal;
  if (buttonVersion >= ButtonVersion.Button2) {
    colorTransform = parseColorTransformWithAlpha(byteStream);
    if (hasFilterList) {
      filters = parseFilterList(byteStream);
    }
    if (hasBlendMode) {
      blendMode = parseBlendMode(byteStream);
    }
  }
  return {
    stateUp,
    stateOver,
    stateDown,
    stateHitTest,
    characterId,
    depth,
    matrix,
    colorTransform,
    filters,
    blendMode,
  };
}

/**
 * Reads a string of at least one Button2 cond actions
 */
export function parseButton2CondActionString(byteStream: ReadableByteStream): ButtonCondAction[] {
  const result: ButtonCondAction[] = [];

  let nextActionOffset: Uint16;
  do {
    const pos: UintSize = byteStream.bytePos;
    nextActionOffset = byteStream.readUint16LE();
    let condActionStream: ReadableByteStream;
    if (nextActionOffset === 0) {
      condActionStream = byteStream;
    } else {
      const condActionSize: UintSize = pos + nextActionOffset - byteStream.bytePos;
      condActionStream = byteStream.take(condActionSize);
    }
    result.push(parseButton2CondAction(condActionStream));
  } while (nextActionOffset !== 0);

  return result;
}

export function parseButton2CondAction(byteStream: ReadableByteStream): ButtonCondAction {
  const conditions: ButtonCond = parseButtonCond(byteStream);
  const actions: Uint8Array = Uint8Array.from(byteStream.tailBytes());
  return {conditions, actions};
}

export function parseButtonCond(byteStream: ReadableByteStream): ButtonCond {
  const flags: Uint16 = byteStream.readUint16LE();

  const idleToOverUp: boolean = (flags & (1 << 0)) !== 0;
  const overUpToIdle: boolean = (flags & (1 << 1)) !== 0;
  const overUpToOverDown: boolean = (flags & (1 << 2)) !== 0;
  const overDownToOverUp: boolean = (flags & (1 << 3)) !== 0;
  const overDownToOutDown: boolean = (flags & (1 << 4)) !== 0;
  const outDownToOverDown: boolean = (flags & (1 << 5)) !== 0;
  const outDownToIdle: boolean = (flags & (1 << 6)) !== 0;
  const idleToOverDown: boolean = (flags & (1 << 7)) !== 0;
  const overDownToIdle: boolean = (flags & (1 << 8)) !== 0;
  let keyPress: Uint7 | undefined = (flags >> 9) & 0x7f;
  if (keyPress === 0) {
    keyPress = undefined;
  } else if (!(
    (1 <= keyPress && keyPress <= 6)
    || keyPress === 8
    || (13 <= keyPress && keyPress <= 19)
    || (32 <= keyPress && keyPress <= 126)
  )) {
    throw new Incident("InvalidKeyCode", {code: keyPress});
  }

  return {
    keyPress,
    overDownToIdle,
    idleToOverUp,
    overUpToIdle,
    overUpToOverDown,
    overDownToOverUp,
    overDownToOutDown,
    outDownToOverDown,
    outDownToIdle,
    idleToOverDown,
  };
}
