import { Incident } from "incident";
import { Uint16, Uint32, Uint7, Uint8 } from "semantic-types";
import { BlendMode } from "swf-tree/blend-mode";
import { ButtonCond } from "swf-tree/button/button-cond";
import { ButtonCondAction } from "swf-tree/button/button-cond-action";
import { ButtonRecord } from "swf-tree/button/button-record";
import { ColorTransformWithAlpha } from "swf-tree/color-transform-with-alpha";
import { Filter } from "swf-tree/filter";
import { Matrix } from "swf-tree/matrix";
import { createIncompleteStreamError } from "../errors/incomplete-stream";
import { BitStream, ByteStream, Stream } from "../stream";
import { parseColorTransformWithAlpha, parseMatrix } from "./basic-data-types";
import { parseBlendMode, parseFilterList } from "./display";

export enum ButtonVersion {
  Button1 = 1,
  Button2 = 2,
}

export function parseButtonRecordString(byteStream: ByteStream, buttonVersion: ButtonVersion): ButtonRecord[] {
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

export function parseButtonRecord(byteStream: ByteStream, buttonVersion: ButtonVersion): ButtonRecord {
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
export function parseButton2CondActionString(byteStream: ByteStream): ButtonCondAction[] {
  const result: ButtonCondAction[] = [];

  let nextActionOffset: Uint16;
  do {
    nextActionOffset = byteStream.readUint16LE();
    result.push(parseButton2CondAction(byteStream));
  } while (nextActionOffset !== 0);

  return result;
}

export function parseButton2CondAction(byteStream: ByteStream): ButtonCondAction {
  const conditions: ButtonCond = parseButtonCond(byteStream);
  const actions: Uint8Array = Uint8Array.from(byteStream.tailBytes());
  return {conditions, actions};
}

export function parseButtonCond(byteStream: ByteStream): ButtonCond {
  const flags: Uint16 = byteStream.readUint16LE();

  let keyPress: Uint7 | undefined = (flags >> 0) & 0x7f;
  if (keyPress === 0) {
    keyPress = undefined;
  } else if (
    keyPress === 7
    || (9 <= keyPress && keyPress <= 12)
    || (20 <= keyPress && keyPress <= 31)
    || keyPress > 126
  ) {
    throw new Incident("InvalidKeyCode", {code: keyPress});
  }

  const overDownToIdle: boolean = (flags & (1 << 7)) !== 0;
  const idleToOverUp: boolean = (flags & (1 << 8)) !== 0;
  const overUpToIdle: boolean = (flags & (1 << 9)) !== 0;
  const overUpToOverDown: boolean = (flags & (1 << 10)) !== 0;
  const overDownToOverUp: boolean = (flags & (1 << 11)) !== 0;
  const overDownToOutDown: boolean = (flags & (1 << 12)) !== 0;
  const outDownToOverDown: boolean = (flags & (1 << 13)) !== 0;
  const outDownToIdle: boolean = (flags & (1 << 14)) !== 0;
  const idleToOverDown: boolean = (flags & (1 << 15)) !== 0;

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
