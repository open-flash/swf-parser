import {CaseStyle, DocumentType, LiteralType} from "kryo";
import {ActionType} from "../action-type";
import {ActionBase} from "./_base";

export interface Less extends ActionBase {
  action: ActionType.Less;
}

export namespace Less {
  export interface Json {
    action: "less";
  }

  export const type: DocumentType<Less> = new DocumentType<Less>({
    properties: {
      action: {type: new LiteralType({type: ActionType.type, value: ActionType.Less})}
    },
    rename: CaseStyle.KebabCase
  });
}
