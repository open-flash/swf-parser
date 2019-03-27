import { Incident } from "incident";

export type Name = "IncompleteStream";
export const name: Name = "IncompleteStream";

export interface Data {
  needed?: number;
}

export type Cause = undefined;
export type IncompleteStreamError = Incident<Data, Name, Cause>;

export function format({needed}: Data) {
  return `Need ${needed === undefined ? "" : needed} more bytes to process the stream`;
}

export function createIncompleteStreamError(needed?: number): IncompleteStreamError {
  return new Incident(name, {needed}, format);
}
