import {CaseStyle, DocumentType, LiteralType} from "kryo";
import {ActionType} from "../action-type";
import {ActionBase} from "./_base";

export interface Unknown extends ActionBase {
  action: ActionType.Unknown;
}

export namespace Unknown {
  export interface Json {
    action: "unknown";
  }

  export const type: DocumentType<Unknown> = new DocumentType<Unknown>({
    properties: {
      action: {type: new LiteralType({type: ActionType.type, value: ActionType.Unknown})}
    },
    rename: CaseStyle.KebabCase
  });
}
