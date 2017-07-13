import {Label, Scene, Tag, tags, TagType} from "swf-tree";
import {Uint16, Uint32, Uint8} from "../integer-names";
import {Stream} from "../stream";
import {parseActionsString} from "./avm1";
import {parseRgb} from "./basic-data-types";

interface SwfTagHeader {
  tagCode: Uint16;
  length: Uint32;
}

function parseSwfTagHeader(byteStream: Stream): SwfTagHeader {
  const codeAndLength: Uint16 = byteStream.readUint16LE();
  const tagCode: Uint16 = codeAndLength >> 6;
  const maxLength: number = (1 << 6) - 1;
  const length: number = codeAndLength & maxLength;

  if (length === maxLength) {
    return {tagCode, length: byteStream.readUint32LE()};
  } else {
    return {tagCode, length};
  }
}

export function parseSwfTag(byteStream: Stream): Tag {
  const {tagCode, length}: SwfTagHeader = parseSwfTagHeader(byteStream);
  const swfTagStream: Stream = byteStream.take(length);

  switch (tagCode) {
    case 0:
      throw new Error("EndOfTags");
    case 1:
      return {type: TagType.ShowFrame};
    case 9:
      return parseSetBackgroundColor(swfTagStream);
    case 12:
      return parseDoAction(swfTagStream);
    case 69:
      return parseFileAttributes(swfTagStream);
    case 86:
      return parseDefineSceneAndFrameLabelData(swfTagStream);
    default:
      return {type: TagType.Unknown, code: tagCode, data: Uint8Array.from(swfTagStream.bytes)};
  }
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

export function parseFileAttributes(byteStream: Stream): tags.FileAttributes {
  const flags: Uint8 = byteStream.readUint8();
  byteStream.skip(3);

  return {
    type: TagType.FileAttributes,
    useDirectBlit: ((flags >> 6) & 1) > 0,
    useGpu: ((flags >> 5) & 1) > 0,
    hasMetadata: ((flags >> 4) & 1) > 0,
    useAs3: ((flags >> 3) & 1) > 0,
    noCrossDomainCaching: ((flags >> 2) & 1) > 0,
    useRelativeUrls: ((flags >> 1) & 1) > 0,
    useNetwork: ((flags >> 0) & 1) > 0,
  };
}

export function parseSetBackgroundColor(byteStream: Stream): tags.SetBackgroundColor {
  return {type: TagType.SetBackgroundColor, color: parseRgb(byteStream)};
}

export function parseDoAction(byteStream: Stream): tags.DoAction {
  return {type: TagType.DoAction, actions: parseActionsString(byteStream)};
}
