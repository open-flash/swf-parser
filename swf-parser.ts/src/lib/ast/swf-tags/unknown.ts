import {CaseStyle, DocumentType, LiteralType} from "kryo";
import {SwfTagType} from "../swf-tag-type";
import {SwfTagBase} from "./_base";

export interface Unknown extends SwfTagBase {
  type: SwfTagType.Unknown;
}

export namespace Unknown {
  export interface Json {
    type: "unknown";
  }

  export const type: DocumentType<Unknown> = new DocumentType<Unknown>({
    properties: {
      type: {type: new LiteralType({type: SwfTagType.type, value: SwfTagType.Unknown})}
    },
    rename: CaseStyle.KebabCase
  });
}
