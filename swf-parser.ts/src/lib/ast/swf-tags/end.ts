import {CaseStyle, DocumentType, LiteralType} from "kryo";
import {SwfTagType} from "../swf-tag-type";
import {SwfTagBase} from "./_base";

export interface End extends SwfTagBase {
  type: SwfTagType.End;
}

export namespace End {
  export interface Json {
    type: "end";
  }

  export const type: DocumentType<End> = new DocumentType<End>({
    properties: {
      type: {type: new LiteralType({type: SwfTagType.type, value: SwfTagType.End})}
    },
    rename: CaseStyle.KebabCase
  });
}
