import {CaseStyle, DocumentType, LiteralType} from "kryo";
import {SwfTagType} from "../swf-tag-type";
import {SwfTagBase} from "./_base";

export interface ShowFrame extends SwfTagBase {
  type: SwfTagType.ShowFrame;
}

export namespace ShowFrame {
  export interface Json {
    type: "show-frame";
  }

  export const type: DocumentType<ShowFrame> = new DocumentType<ShowFrame>({
    properties: {
      type: {type: new LiteralType({type: SwfTagType.type, value: SwfTagType.ShowFrame})}
    },
    rename: CaseStyle.KebabCase
  });
}
