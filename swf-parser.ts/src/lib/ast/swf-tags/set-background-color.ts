import {CaseStyle, DocumentType, LiteralType} from "kryo";
import {Rgb} from "../rgb";
import {SwfTagType} from "../swf-tag-type";
import {SwfTagBase} from "./_base";

export interface SetBackgroundColor extends SwfTagBase {
  type: SwfTagType.SetBackgroundColor;
  color: Rgb;
}

export namespace SetBackgroundColor {
  export interface Json {
    type: "set-background-color";
    color: Rgb.Json;
  }

  export const type: DocumentType<SetBackgroundColor> = new DocumentType<SetBackgroundColor>({
    properties: {
      type: {type: new LiteralType({type: SwfTagType.type, value: SwfTagType.SetBackgroundColor})},
      color: {type: Rgb.type}
    },
    rename: CaseStyle.KebabCase
  });
}
