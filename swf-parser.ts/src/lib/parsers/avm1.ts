import { Incident } from "incident";
import { Uint16, Uint8, UintSize } from "semantic-types";
import { avm1 } from "swf-tree";
import { createIncompleteStreamError } from "../errors/incomplete-stream";
import { BitStream, ByteStream } from "../stream";
import * as actions from "swf-tree/_src/avm1/actions/index";

export interface RawIf {
  action: avm1.ActionType.If,
  byteOffset: Uint16,
}

export interface RawJump {
  action: avm1.ActionType.Jump,
  byteOffset: Uint16,
}

// avm1.Action where If is replaced by RawIf and Jump by RawJump
export type RawAction =
  actions.Unknown
  | actions.Add
  | actions.Add2
  | actions.And
  | actions.AsciiToChar
  | actions.BitAnd
  | actions.BitLShift
  | actions.BitOr
  | actions.BitRShift
  | actions.BitURShift
  | actions.BitXor
  | actions.Call
  | actions.CallFunction
  | actions.CallMethod
  | actions.CastOp
  | actions.CharToAscii
  | actions.CloneSprite
  | actions.ConstantPool
  | actions.Decrement
  | actions.DefineFunction
  | actions.DefineFunction2
  | actions.DefineLocal
  | actions.DefineLocal2
  | actions.Delete
  | actions.Delete2
  | actions.Divide
  | actions.EndDrag
  | actions.Enumerate
  | actions.Enumerate2
  | actions.Equals
  | actions.Equals2
  | actions.Extends
  | actions.FsCommand2
  | actions.GetMember
  | actions.GetProperty
  | actions.GetTime
  | actions.GetUrl
  | actions.GetUrl2
  | actions.GetVariable
  | actions.GotoFrame
  | actions.GotoFrame2
  | actions.GotoLabel
  | actions.Greater
  | RawIf
  | actions.ImplementsOp
  | actions.Increment
  | actions.InitArray
  | actions.InitObject
  | actions.InstanceOf
  | RawJump
  | actions.Less
  | actions.Less2
  | actions.MbAsciiToChar
  | actions.MbCharToAscii
  | actions.MbStringExtract
  | actions.MbStringLength
  | actions.Modulo
  | actions.Multiply
  | actions.NewMethod
  | actions.NewObject
  | actions.NextFrame
  | actions.Not
  | actions.Or
  | actions.Play
  | actions.Pop
  | actions.PreviousFrame
  | actions.Push
  | actions.PushDuplicate
  | actions.RandomNumber
  | actions.RemoveSprite
  | actions.Return
  | actions.SetMember
  | actions.SetProperty
  | actions.SetTarget
  | actions.SetTarget2
  | actions.SetVariable
  | actions.StackSwap
  | actions.StartDrag
  | actions.Stop
  | actions.StopSounds
  | actions.StoreRegister
  | actions.StrictEquals
  | actions.StrictMode
  | actions.StringAdd
  | actions.StringEquals
  | actions.StringExtract
  | actions.StringGreater
  | actions.StringLength
  | actions.StringLess
  | actions.Subtract
  | actions.TargetPath
  | actions.Throw
  | actions.ToggleQuality
  | actions.ToInteger
  | actions.ToNumber
  | actions.ToString
  | actions.Trace
  | actions.Try
  | actions.TypeOf
  | actions.WaitForFrame
  | actions.WaitForFrame2
  | actions.With;


export interface ActionHeader {
  actionCode: Uint8;
  length: Uint16;
}

export function parseActionHeader(byteStream: ByteStream): ActionHeader {
  const actionCode: Uint8 = byteStream.readUint8();
  const length: Uint16 = actionCode < 0x80 ? 0 : byteStream.readUint16LE();
  return {actionCode, length};
}

export function parseActionString(byteStream: ByteStream): avm1.Action[] {
  return parseActionStream(byteStream, streamParseActionString);
}

function* streamParseActionString(byteStream: ByteStream): Iterable<RawAction> {
  while (true) {
    if (byteStream.available() === 0) {
      throw createIncompleteStreamError();
    }
    if (byteStream.peekUint8() === 0) {
      byteStream.skip(1);
      break;
    }
    yield parseAction(byteStream);
  }
}

export function parseActionBlock(byteStream: ByteStream): avm1.Action[] {
  return parseActionStream(byteStream, streamParseActionBlock);
}

function* streamParseActionBlock(byteStream: ByteStream): Iterable<RawAction> {
  while (byteStream.available() > 0) {
    yield parseAction(byteStream);
  }
}

function parseActionStream(
  byteStream: ByteStream,
  rawActionStreamParser: (byteStream: ByteStream) => Iterable<RawAction>
): avm1.Action[] {
  interface IndexedAction {
    action: RawAction;
    index: UintSize;
    byteSize: UintSize;
  }

  const result: avm1.Action[] = [];
  const bytesToIndexedAction: Map<UintSize, IndexedAction> = new Map();
  let bytePos: UintSize = byteStream.bytePos;
  let index: UintSize = 0;
  for (const action of rawActionStreamParser(byteStream)) {
    const byteSize = byteStream.bytePos - bytePos;
    bytesToIndexedAction.set(bytePos, {byteSize, action, index});
    // We are pushing raw actions and mutating them to add `offset`
    // TODO: Cleaner approach avoiding this kind of mutation
    result.push(action as any);
    bytePos = byteStream.bytePos;
    index++;
  }
  const endBytePos: UintSize = bytePos;
  for (const [bytes, indexedAction] of bytesToIndexedAction) {
    if (indexedAction.action.action === avm1.ActionType.If || indexedAction.action.action === avm1.ActionType.Jump) {
      const targetBytes = bytes + indexedAction.byteSize + indexedAction.action.byteOffset;
      if (targetBytes === endBytePos) {
        (<any> indexedAction.action as avm1.actions.If | avm1.actions.Jump).offset = result.length - (index + 1);
        continue;
      }
      const target: IndexedAction | undefined = bytesToIndexedAction.get(targetBytes);
      if (target === undefined) {
        throw new Error("Unable to map bytes offset to action offset");
      }
      (<any> indexedAction.action as avm1.actions.If | avm1.actions.Jump).offset = target.index - (indexedAction.index + 1);
    }
  }
  return result;
}

// tslint:disable-next-line:cyclomatic-complexity
export function parseAction(byteStream: ByteStream): RawAction {
  const startPos: number = byteStream.bytePos;
  const header: ActionHeader = parseActionHeader(byteStream);
  if (byteStream.available() < header.length) {
    const headerLength: number = byteStream.bytePos - startPos;
    throw createIncompleteStreamError(headerLength + header.length);
  }
  const actionDataStartPos: number = byteStream.bytePos;
  let result: RawAction;
  switch (header.actionCode) {
    case 0x04:
      result = {action: avm1.ActionType.NextFrame};
      break;
    case 0x05:
      result = {action: avm1.ActionType.PreviousFrame};
      break;
    case 0x06:
      result = {action: avm1.ActionType.Play};
      break;
    case 0x07:
      result = {action: avm1.ActionType.Stop};
      break;
    case 0x08:
      result = {action: avm1.ActionType.ToggleQuality};
      break;
    case 0x09:
      result = {action: avm1.ActionType.StopSounds};
      break;
    case 0x0a:
      result = {action: avm1.ActionType.Add};
      break;
    case 0x0b:
      result = {action: avm1.ActionType.Subtract};
      break;
    case 0x0c:
      result = {action: avm1.ActionType.Multiply};
      break;
    case 0x0d:
      result = {action: avm1.ActionType.Divide};
      break;
    case 0x0e:
      result = {action: avm1.ActionType.Equals};
      break;
    case 0x0f:
      result = {action: avm1.ActionType.Less};
      break;
    case 0x10:
      result = {action: avm1.ActionType.And};
      break;
    case 0x11:
      result = {action: avm1.ActionType.Or};
      break;
    case 0x12:
      result = {action: avm1.ActionType.Not};
      break;
    case 0x13:
      result = {action: avm1.ActionType.StringEquals};
      break;
    case 0x14:
      result = {action: avm1.ActionType.StringLength};
      break;
    case 0x15:
      result = {action: avm1.ActionType.StringExtract};
      break;
    case 0x17:
      result = {action: avm1.ActionType.Pop};
      break;
    case 0x18:
      result = {action: avm1.ActionType.ToInteger};
      break;
    case 0x1c:
      result = {action: avm1.ActionType.GetVariable};
      break;
    case 0x1d:
      result = {action: avm1.ActionType.SetVariable};
      break;
    case 0x20:
      result = {action: avm1.ActionType.SetTarget2};
      break;
    case 0x21:
      result = {action: avm1.ActionType.StringAdd};
      break;
    case 0x22:
      result = {action: avm1.ActionType.GetProperty};
      break;
    case 0x23:
      result = {action: avm1.ActionType.SetProperty};
      break;
    case 0x24:
      result = {action: avm1.ActionType.CloneSprite};
      break;
    case 0x25:
      result = {action: avm1.ActionType.RemoveSprite};
      break;
    case 0x26:
      result = {action: avm1.ActionType.Trace};
      break;
    case 0x27:
      result = {action: avm1.ActionType.StartDrag};
      break;
    case 0x28:
      result = {action: avm1.ActionType.EndDrag};
      break;
    case 0x29:
      result = {action: avm1.ActionType.StringLess};
      break;
    case 0x2a:
      result = {action: avm1.ActionType.Throw};
      break;
    case 0x2b:
      result = {action: avm1.ActionType.CastOp};
      break;
    case 0x2c:
      result = {action: avm1.ActionType.ImplementsOp};
      break;
    case 0x2d:
      result = {action: avm1.ActionType.FsCommand2};
      break;
    case 0x30:
      result = {action: avm1.ActionType.RandomNumber};
      break;
    case 0x31:
      result = {action: avm1.ActionType.MbStringLength};
      break;
    case 0x32:
      result = {action: avm1.ActionType.CharToAscii};
      break;
    case 0x33:
      result = {action: avm1.ActionType.AsciiToChar};
      break;
    case 0x34:
      result = {action: avm1.ActionType.GetTime};
      break;
    case 0x35:
      result = {action: avm1.ActionType.MbStringExtract};
      break;
    case 0x36:
      result = {action: avm1.ActionType.MbCharToAscii};
      break;
    case 0x37:
      result = {action: avm1.ActionType.MbAsciiToChar};
      break;
    case 0x3a:
      result = {action: avm1.ActionType.Delete};
      break;
    case 0x3b:
      result = {action: avm1.ActionType.Delete2};
      break;
    case 0x3c:
      result = {action: avm1.ActionType.DefineLocal};
      break;
    case 0x3d:
      result = {action: avm1.ActionType.CallFunction};
      break;
    case 0x3e:
      result = {action: avm1.ActionType.Return};
      break;
    case 0x3f:
      result = {action: avm1.ActionType.Modulo};
      break;
    case 0x40:
      result = {action: avm1.ActionType.NewObject};
      break;
    case 0x41:
      result = {action: avm1.ActionType.DefineLocal2};
      break;
    case 0x42:
      result = {action: avm1.ActionType.InitArray};
      break;
    case 0x43:
      result = {action: avm1.ActionType.InitObject};
      break;
    case 0x44:
      result = {action: avm1.ActionType.TypeOf};
      break;
    case 0x45:
      result = {action: avm1.ActionType.TargetPath};
      break;
    case 0x46:
      result = {action: avm1.ActionType.Enumerate};
      break;
    case 0x47:
      result = {action: avm1.ActionType.Add2};
      break;
    case 0x48:
      result = {action: avm1.ActionType.Less2};
      break;
    case 0x49:
      result = {action: avm1.ActionType.Equals2};
      break;
    case 0x4a:
      result = {action: avm1.ActionType.ToNumber};
      break;
    case 0x4b:
      result = {action: avm1.ActionType.ToString};
      break;
    case 0x4c:
      result = {action: avm1.ActionType.PushDuplicate};
      break;
    case 0x4d:
      result = {action: avm1.ActionType.StackSwap};
      break;
    case 0x4e:
      result = {action: avm1.ActionType.GetMember};
      break;
    case 0x4f:
      result = {action: avm1.ActionType.SetMember};
      break;
    case 0x50:
      result = {action: avm1.ActionType.Increment};
      break;
    case 0x51:
      result = {action: avm1.ActionType.Decrement};
      break;
    case 0x52:
      result = {action: avm1.ActionType.CallMethod};
      break;
    case 0x53:
      result = {action: avm1.ActionType.NewMethod};
      break;
    case 0x54:
      result = {action: avm1.ActionType.InstanceOf};
      break;
    case 0x55:
      result = {action: avm1.ActionType.Enumerate2};
      break;
    case 0x60:
      result = {action: avm1.ActionType.BitAnd};
      break;
    case 0x61:
      result = {action: avm1.ActionType.BitOr};
      break;
    case 0x62:
      result = {action: avm1.ActionType.BitXor};
      break;
    case 0x63:
      result = {action: avm1.ActionType.BitLShift};
      break;
    case 0x64:
      result = {action: avm1.ActionType.BitRShift};
      break;
    case 0x65:
      result = {action: avm1.ActionType.BitURShift};
      break;
    case 0x66:
      result = {action: avm1.ActionType.StrictEquals};
      break;
    case 0x67:
      result = {action: avm1.ActionType.Greater};
      break;
    case 0x68:
      result = {action: avm1.ActionType.StringGreater};
      break;
    case 0x69:
      result = {action: avm1.ActionType.Extends};
      break;
    case 0x81:
      result = parseGotoFrameAction(byteStream);
      break;
    case 0x83:
      result = parseGetUrlAction(byteStream);
      break;
    case 0x87:
      result = parseStoreRegisterAction(byteStream);
      break;
    case 0x88:
      result = parseConstantPoolAction(byteStream);
      break;
    case 0x8a:
      result = parseWaitForFrameAction(byteStream);
      break;
    case 0x8b:
      result = parseSetTargetAction(byteStream);
      break;
    case 0x8c:
      result = parseGotoLabelAction(byteStream);
      break;
    case 0x8d:
      result = parseWaitForFrame2Action(byteStream);
      break;
    case 0x8e:
      result = parseDefineFunction2Action(byteStream);
      break;
    case 0x8f:
      result = parseTryAction(byteStream);
      break;
    case 0x94:
      result = parseWithAction(byteStream);
      break;
    case 0x96:
      result = parsePushAction(byteStream.take(header.length));
      break;
    case 0x99:
      result = parseJumpAction(byteStream);
      break;
    case 0x9a:
      result = parseGetUrl2Action(byteStream);
      break;
    case 0x9b:
      result = parseDefineFunctionAction(byteStream);
      break;
    case 0x9d:
      result = parseIfAction(byteStream);
      break;
    case 0x9e:
      result = {action: avm1.ActionType.Call};
      break;
    case 0x9f:
      result = parseGotoFrame2Action(byteStream);
      break;
    default:
      result = {action: avm1.ActionType.Unknown, actionCode: header.actionCode};
      byteStream.skip(header.length);
      break;
  }
  const actionDataLength: number = byteStream.bytePos - actionDataStartPos;
  if (actionDataLength < header.length) {
    byteStream.skip(header.length - actionDataLength);
  }

  return result;
}

export function parseGotoFrameAction(byteStream: ByteStream): avm1.actions.GotoFrame {
  const frame: Uint16 = byteStream.readUint16LE();
  return {
    action: avm1.ActionType.GotoFrame,
    frame,
  };
}

export function parseGetUrlAction(byteStream: ByteStream): avm1.actions.GetUrl {
  const url: string = byteStream.readCString();
  const target: string = byteStream.readCString();
  return {
    action: avm1.ActionType.GetUrl,
    url,
    target,
  };
}

export function parseStoreRegisterAction(byteStream: ByteStream): avm1.actions.StoreRegister {
  const registerNumber: Uint8 = byteStream.readUint8();
  return {
    action: avm1.ActionType.StoreRegister,
    registerNumber,
  };
}

export function parseConstantPoolAction(byteStream: ByteStream): avm1.actions.ConstantPool {
  const constantCount: UintSize = byteStream.readUint16LE();
  const constantPool: string[] = [];
  for (let i: number = 0; i < constantCount; i++) {
    constantPool.push(byteStream.readCString());
  }
  return {
    action: avm1.ActionType.ConstantPool,
    constantPool,
  };
}

export function parseWaitForFrameAction(byteStream: ByteStream): avm1.actions.WaitForFrame {
  const frame: UintSize = byteStream.readUint16LE();
  const skipCount: UintSize = byteStream.readUint8();
  return {
    action: avm1.ActionType.WaitForFrame,
    frame,
    skipCount,
  };
}

export function parseSetTargetAction(byteStream: ByteStream): avm1.actions.SetTarget {
  const targetName: string = byteStream.readCString();
  return {
    action: avm1.ActionType.SetTarget,
    targetName,
  };
}

export function parseGotoLabelAction(byteStream: ByteStream): avm1.actions.GotoLabel {
  const label: string = byteStream.readCString();
  return {
    action: avm1.ActionType.GotoLabel,
    label,
  };
}

export function parseWaitForFrame2Action(byteStream: ByteStream): avm1.actions.WaitForFrame2 {
  const skipCount: UintSize = byteStream.readUint8();
  return {
    action: avm1.ActionType.WaitForFrame2,
    skipCount,
  };
}

export function parseDefineFunction2Action(byteStream: ByteStream): avm1.actions.DefineFunction2 {
  const name: string = byteStream.readCString();
  const parameterCount: UintSize = byteStream.readUint16LE();
  const registerCount: UintSize = byteStream.readUint8();

  const flags: Uint16 = byteStream.readUint16LE();
  const preloadThis: boolean = (flags & (1 << 0)) !== 0;
  const suppressThis: boolean = (flags & (1 << 1)) !== 0;
  const preloadArguments: boolean = (flags & (1 << 2)) !== 0;
  const suppressArguments: boolean = (flags & (1 << 3)) !== 0;
  const preloadSuper: boolean = (flags & (1 << 4)) !== 0;
  const suppressSuper: boolean = (flags & (1 << 5)) !== 0;
  const preloadRoot: boolean = (flags & (1 << 6)) !== 0;
  const preloadParent: boolean = (flags & (1 << 7)) !== 0;
  const preloadGlobal: boolean = (flags & (1 << 8)) !== 0;
  // Skip 7 bits

  const parameters: avm1.Parameter[] = [];
  for (let i: number = 0; i < parameterCount; i++) {
    const register: Uint8 = byteStream.readUint8();
    const name: string = byteStream.readCString();
    parameters.push({register, name});
  }
  const codeSize: UintSize = byteStream.readUint16LE();
  const body: avm1.Action[] = parseActionBlock(byteStream.take(codeSize));

  return {
    action: avm1.ActionType.DefineFunction2,
    name,
    preloadParent,
    preloadRoot,
    suppressSuper,
    preloadSuper,
    suppressArguments,
    preloadArguments,
    suppressThis,
    preloadThis,
    preloadGlobal,
    registerCount,
    parameters,
    body,
  };
}

function parseCatchTarget(byteStream: ByteStream, catchInRegister: boolean): avm1.CatchTarget {
  if (catchInRegister) {
    return {type: avm1.CatchTargetType.Register, register: byteStream.readUint8()};
  } else {
    return {type: avm1.CatchTargetType.Variable, variable: byteStream.readCString()};
  }
}

export function parseTryAction(byteStream: ByteStream): avm1.actions.Try {
  const flags: Uint8 = byteStream.readUint8();
  // (Skip first 5 bits)
  const catchInRegister: boolean = (flags & (1 << 2)) !== 0;
  const hasFinallyBlock: boolean = (flags & (1 << 1)) !== 0;
  const hasCatchBlock: boolean = (flags & (1 << 0)) !== 0;

  const trySize: Uint16 = byteStream.readUint16LE();
  const finallySize: Uint16 = byteStream.readUint16LE();
  const catchSize: Uint16 = byteStream.readUint16LE();
  const catchTarget: avm1.CatchTarget = parseCatchTarget(byteStream, catchInRegister);
  const tryBody: avm1.Action[] = parseActionBlock(byteStream.take(trySize));
  let catchBody: avm1.Action[] | undefined = undefined;
  if (hasCatchBlock) {
    catchBody = parseActionBlock(byteStream.take(catchSize));
  }
  let finallyBody: avm1.Action[] | undefined = undefined;
  if (hasFinallyBlock) {
    finallyBody = parseActionBlock(byteStream.take(finallySize));
  }
  return {
    action: avm1.ActionType.Try,
    try: tryBody,
    catch: catchBody,
    catchTarget,
    finally: finallyBody,
  };
}

export function parseWithAction(byteStream: ByteStream): avm1.actions.With {
  const withSize: Uint16 = byteStream.readUint16LE();
  const withBody: avm1.Action[] = parseActionBlock(byteStream.take(withSize));
  return {
    action: avm1.ActionType.With,
    with: withBody,
  };
}

export function parsePushAction(byteStream: ByteStream): avm1.actions.Push {
  const values: avm1.Value[] = [];
  while (byteStream.available() > 0) {
    values.push(parseActionValue(byteStream));
  }
  return {
    action: avm1.ActionType.Push,
    values,
  };
}

export function parseActionValue(byteStream: ByteStream): avm1.Value {
  const typeCode: Uint8 = byteStream.readUint8();
  switch (typeCode) {
    case 0:
      return {type: avm1.ValueType.String, value: byteStream.readCString()};
    case 1:
      return {type: avm1.ValueType.Float32, value: byteStream.readFloat32LE()};
    case 2:
      return {type: avm1.ValueType.Null};
    case 3:
      return {type: avm1.ValueType.Undefined};
    case 4:
      return {type: avm1.ValueType.Register, value: byteStream.readUint8()};
    case 5:
      return {type: avm1.ValueType.Boolean, value: byteStream.readUint8() !== 0};
    case 6:
      return {type: avm1.ValueType.Float64, value: byteStream.readFloat64LE()};
    case 7:
      return {type: avm1.ValueType.Sint32, value: byteStream.readSint32LE()};
    case 8:
      return {type: avm1.ValueType.Constant, value: byteStream.readUint8() as Uint16};
    case 9:
      return {type: avm1.ValueType.Constant, value: byteStream.readUint16LE()};
    default:
      throw new Error(`Unknown type code: ${typeCode}`);
  }
}

export function parseJumpAction(byteStream: ByteStream): RawJump {
  const byteOffset: Uint16 = byteStream.readSint16LE();
  return {
    action: avm1.ActionType.Jump,
    byteOffset,
  };
}

export function parseGetUrl2Action(byteStream: ByteStream): avm1.actions.GetUrl2 {
  const bitStream: BitStream = byteStream.asBitStream();

  let method: avm1.GetUrl2Method;
  switch (bitStream.readUint16Bits(2)) {
    case 0:
      method = avm1.GetUrl2Method.None;
      break;
    case 1:
      method = avm1.GetUrl2Method.Get;
      break;
    case 2:
      method = avm1.GetUrl2Method.Post;
      break;
    default:
      throw new Incident("UnexpectGetUrl2Method", "Unexpected value for the getUrl2 method");
  }
  bitStream.skipBits(4);
  const loadTarget: boolean = bitStream.readBoolBits();
  const loadVariables: boolean = bitStream.readBoolBits();

  bitStream.align();

  return {
    action: avm1.ActionType.GetUrl2,
    method,
    loadTarget,
    loadVariables,
  };
}

export function parseDefineFunctionAction(byteStream: ByteStream): avm1.actions.DefineFunction {
  const name: string = byteStream.readCString();
  const parameterCount: UintSize = byteStream.readUint16LE();
  const parameters: string[] = [];
  for (let i: number = 0; i < parameterCount; i++) {
    parameters.push(byteStream.readCString());
  }
  const bodySize: UintSize = byteStream.readUint16LE();
  const body: avm1.Action[] = parseActionBlock(byteStream.take(bodySize));

  return {
    action: avm1.ActionType.DefineFunction,
    name,
    parameters,
    body,
  };
}

export function parseIfAction(byteStream: ByteStream): RawIf {
  const byteOffset: Uint16 = byteStream.readSint16LE();
  return {
    action: avm1.ActionType.If,
    byteOffset,
  };
}

export function parseGotoFrame2Action(byteStream: ByteStream): avm1.actions.GotoFrame2 {
  const flags: Uint8 = byteStream.readUint8();
  // (Skip first 6 bits)
  const hasSceneBias: boolean = (flags & (1 << 1)) !== 0;
  const play: boolean = (flags & (1 << 0)) !== 0;
  const sceneBias: Uint16 = hasSceneBias ? byteStream.readUint16LE() : 0;
  return {
    action: avm1.ActionType.GotoFrame2,
    play,
    sceneBias,
  };
}
