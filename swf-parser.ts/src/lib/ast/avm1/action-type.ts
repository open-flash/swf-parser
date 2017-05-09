import {CaseStyle, SimpleEnumType} from "kryo";

export enum ActionType {
  Less,
  Unknown
}

export namespace ActionType {
  export type Json =
    "less"
    | "unknown";

  export const type: SimpleEnumType<ActionType> = new SimpleEnumType<ActionType>({
    enum: ActionType,
    rename: CaseStyle.KebabCase
  });
}
