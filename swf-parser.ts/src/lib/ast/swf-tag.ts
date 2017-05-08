import {TaggedUnionType} from "kryo";
import * as swfTags from "./swf-tags/index";

export type SwfTag =
  swfTags.DefineSceneAndFrameLabelData
  | swfTags.End
  | swfTags.FileAttributes
  | swfTags.SetBackgroundColor
  | swfTags.ShowFrame
  | swfTags.Unknown;

export namespace SwfTag {
  export type Json =
    swfTags.DefineSceneAndFrameLabelData.Json
    | swfTags.End.Json
    | swfTags.FileAttributes.Json
    | swfTags.SetBackgroundColor.Json
    | swfTags.ShowFrame.Json
    | swfTags.Unknown.Json;

  export const type: TaggedUnionType<SwfTag> = new TaggedUnionType<SwfTag>({
    variants: [
      swfTags.DefineSceneAndFrameLabelData.type,
      swfTags.End.type,
      swfTags.FileAttributes.type,
      swfTags.SetBackgroundColor.type,
      swfTags.ShowFrame.type,
      swfTags.Unknown.type
    ],
    tag: "type"
  });
}
