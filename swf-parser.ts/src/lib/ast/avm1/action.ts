import {TaggedUnionType} from "kryo";
import * as actions from "./actions/index";

export type Action =
  actions.Less
  | actions.Unknown;

export namespace Action {
  export type Json =
    actions.Less.Json
    | actions.Unknown.Json;

  export const type: TaggedUnionType<Action> = new TaggedUnionType<Action>({
    variants: [
      actions.Less.type,
      actions.Unknown.type
    ],
    tag: "action"
  });
}
