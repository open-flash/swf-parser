import {Stream} from "../stream";
import {SwfTag} from "../ast/swf-tag";
import * as swfTags from "../ast/swf-tags/index";
import {Uint16, Uint32, Uint8} from "../integer-names";
import {SwfTagType} from "../ast/swf-tag-type";
import {parseRgb} from "./basic-data-types";
import {Scene} from "../ast/scene";
import {Label} from "../ast/label";
import {parseActionsString} from "./avm1";

interface SwfTagHeader {
  tagCode: Uint16;
  length: Uint32;
}

function parseSwfTagHeader(byteStream: Stream): SwfTagHeader {
  const codeAndLength: Uint16 = byteStream.readUint16LE();
  const tagCode: Uint16 = codeAndLength >> 6;
  const maxLength: number = (1 << 6) - 1;
  const length = codeAndLength & maxLength;

  if (length == maxLength) {
    return {tagCode, length: byteStream.readUint32LE()};
  } else {
    return {tagCode, length};
  }
}

/*

 fn swf_tag(input: &[u8]) -> IResult<&[u8], ast::SwfTag> {
 match record_header(input) {
 IResult::Done(remaining_input, rh) => {
 if remaining_input.len() < rh.length {
 let record_header_length = input.len() - remaining_input.len();
 IResult::Incomplete(Needed::Size(record_header_length + rh.length))
 } else {
 let record_data: &[u8] = &remaining_input[..rh.length];
 let remaining_input: &[u8] = &remaining_input[rh.length..];
 let record_result = match rh.tag_code {
 0 => IResult::Done(&record_data[rh.length..], ast::SwfTag::End(ast::EndTag {})),
 1 => IResult::Done(&record_data[rh.length..], ast::SwfTag::ShowFrame(ast::ShowFrameTag {})),
 9 => map!(record_data, set_background_color_tag, |t| ast::SwfTag::SetBackgroundColor(t)),
 // TODO: Ignore DoAction if version >= 9 && use_as3
 12 => map!(record_data, do_action_tag, |t| ast::SwfTag::DoAction(t)),
 // TODO: 59 => DoInitAction
 69 => map!(record_data, file_attributes_tag, |t| ast::SwfTag::FileAttributes(t)),
 86 => map!(record_data, define_scene_and_frame_label_data_tag, |t| ast::SwfTag::DefineSceneAndFrameLabelData(t)),
 _ => {
 IResult::Done(&[][..], ast::SwfTag::Unknown(ast::UnknownTag { tag_code: rh.tag_code, data: record_data.to_vec() }))
 }
 };
 match record_result {
 IResult::Done(_, o) => IResult::Done(remaining_input, o),
 IResult::Error(e) => IResult::Error(e),
 IResult::Incomplete(n) => IResult::Incomplete(n),
 }
 }
 }
 IResult::Error(e) => IResult::Error(e),
 IResult::Incomplete(n) => IResult::Incomplete(n),
 }
 }

 */

export function parseSwfTag(byteStream: Stream): SwfTag {
  const {tagCode, length}: SwfTagHeader = parseSwfTagHeader(byteStream);
  const swfTagStream: Stream = byteStream.take(length);

  switch (tagCode) {
    case 0:
      return {type: SwfTagType.End};
    case 1:
      return {type: SwfTagType.ShowFrame};
    case 9:
      return parseSetBackgroundColor(swfTagStream);
    case 12:
      return parseDoAction(swfTagStream);
    case 69:
      return parseFileAttributes(swfTagStream);
    case 86:
      return parseDefineSceneAndFrameLabelData(swfTagStream);
    default:
      return {type: SwfTagType.Unknown};
  }
}

export function parseDefineSceneAndFrameLabelData(byteStream: Stream): swfTags.DefineSceneAndFrameLabelData {
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
    type: SwfTagType.DefineSceneAndFrameLabelData,
    scenes,
    labels
  };
}

export function parseFileAttributes(byteStream: Stream): swfTags.FileAttributes {
  const flags: Uint8 = byteStream.readUint8LE();
  byteStream.skip(3);

  return {
    type: SwfTagType.FileAttributes,
    useDirectBlit: ((flags >> 6) & 1) > 0,
    useGpu: ((flags >> 5) & 1) > 0,
    hasMetadata: ((flags >> 4) & 1) > 0,
    useAs3: ((flags >> 3) & 1) > 0,
    noCrossDomainCaching: ((flags >> 2) & 1) > 0,
    useRelativeUrls: ((flags >> 1) & 1) > 0,
    useNetwork: ((flags >> 0) & 1) > 0
  };
}

export function parseSetBackgroundColor(byteStream: Stream): swfTags.SetBackgroundColor {
  return {type: SwfTagType.SetBackgroundColor, color: parseRgb(byteStream)};
}

export function parseDoAction(byteStream: Stream): swfTags.DoAction {
  return {type: SwfTagType.DoAction, actions: parseActionsString(byteStream)};
}
