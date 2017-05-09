import {ArrayType, CaseStyle, DocumentType, LiteralType} from "kryo";
import * as avm1 from "../avm1/index";
import {SwfTagType} from "../swf-tag-type";
import {SwfTagBase} from "./_base";

export interface DoAction extends SwfTagBase {
  type: SwfTagType.DoAction;
  actions: avm1.Action[];
}

export namespace DoAction {
  export interface Json {
    type: "do-action";
    actions: avm1.Action.Json[];
  }

  export const type: DocumentType<DoAction> = new DocumentType<DoAction>({
    properties: {
      type: {type: new LiteralType({type: SwfTagType.type, value: SwfTagType.DoAction})},
      actions: {type: new ArrayType({itemType: avm1.Action.type, maxLength: Infinity})}
    },
    rename: CaseStyle.KebabCase
  });
}
