import { Incident } from "incident";
import { Uint16, Uint32, Uint8 } from "semantic-types";
import { Action } from "swf-tree/avm1/action";
import { BlendMode } from "swf-tree/blend-mode";
import { ButtonCond } from "swf-tree/buttons/button-cond";
import { ButtonCondAction } from "swf-tree/buttons/button-cond-action";
import { ButtonRecord } from "swf-tree/buttons/button-record";
import { ColorTransformWithAlpha } from "swf-tree/color-transform-with-alpha";
import { Filter } from "swf-tree/filter";
import { Matrix } from "swf-tree/matrix";
import { createIncompleteStreamError } from "../errors/incomplete-stream";
import { BitStream, ByteStream, Stream } from "../stream";
import { parseActionsString } from "./avm1";
import { parseColorTransformWithAlpha, parseMatrix } from "./basic-data-types";
import { parseBlendMode, parseFilterList } from "./display";

export enum ButtonVersion {
  Button1,
  Button2,
}

export function parseButtonRecordString(byteStream: Stream, buttonVersion: ButtonVersion): ButtonRecord[] {
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

export function parseButtonRecord(byteStream: Stream, buttonVersion: ButtonVersion): ButtonRecord {
  const flags: Uint8 = byteStream.readUint8();
  // (Skip first 2 bits)
  const hasBlendMode: boolean = (flags & (1 << 5)) !== 0;
  const hasFilterList: boolean = (flags & (1 << 4)) !== 0;
  const stateHitTest: boolean = (flags & (1 << 3)) !== 0;
  const stateDown: boolean = (flags & (1 << 2)) !== 0;
  const stateOver: boolean = (flags & (1 << 1)) !== 0;
  const stateUp: boolean = (flags & (1 << 0)) !== 0;

  const characterId: Uint16 = byteStream.readUint16LE();
  const depth: Uint16 = byteStream.readUint16LE();
  const matrix: Matrix = parseMatrix(byteStream);
  let colorTransform: ColorTransformWithAlpha | undefined = undefined;
  if (buttonVersion !== ButtonVersion.Button1) {
    colorTransform = parseColorTransformWithAlpha(byteStream);
  }
  let filters: Filter[] | undefined = undefined;
  if (buttonVersion !== ButtonVersion.Button1 && hasFilterList) {
    filters = parseFilterList(byteStream);
  }
  let blendMode: BlendMode = BlendMode.Normal;
  if (buttonVersion !== ButtonVersion.Button1 && hasBlendMode) {
    blendMode = parseBlendMode(byteStream);
  }
  return {
    stateHitTest,
    stateDown,
    stateOver,
    stateUp,
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
export function parseButton2CondActionString(byteStream: Stream): ButtonCondAction[] {
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
  const actions: Action[] = parseActionsString(byteStream);
  return {conditions, actions};
}

export function parseButtonCond(byteStream: ByteStream): ButtonCond {
  const bitStream: BitStream = byteStream.asBitStream();

  const idleToOverDown: boolean = bitStream.readBoolBits();
  const outDownToIdle: boolean = bitStream.readBoolBits();
  const outDownToOverDown: boolean = bitStream.readBoolBits();
  const overDownToOutDown: boolean = bitStream.readBoolBits();
  const overDownToOverUp: boolean = bitStream.readBoolBits();
  const overUpToOverDown: boolean = bitStream.readBoolBits();
  const overUpToIdle: boolean = bitStream.readBoolBits();
  const idleToOverUp: boolean = bitStream.readBoolBits();

  let keyPress: Uint32 | undefined = bitStream.readUint32Bits(7);
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

  const overDownToIdle: boolean = bitStream.readBoolBits();

  bitStream.align();

  return {
    idleToOverDown,
    outDownToIdle,
    outDownToOverDown,
    overDownToOutDown,
    overDownToOverUp,
    overUpToOverDown,
    overUpToIdle,
    idleToOverUp,
    overDownToIdle,
    keyPress,
  };
}
