import {Incident} from "incident";

export namespace IncompleteStreamError {
  export type Name = "IncompleteStream";
  export const name: Name = "IncompleteStream";

  export interface Data {
    needed?: number;
  }

  export type Cause = undefined;
  export type Type = Incident<Name, Data, Cause>;

  export function format({needed}: Data) {
    return `Need ${needed === undefined ? "" : needed} more bytes to process the stream`;
  }

  export function create(needed?: number): Type {
    return new Incident(name, {needed}, format);
  }
}
export type IncompleteStreamError = IncompleteStreamError.Type;

export default IncompleteStreamError;
