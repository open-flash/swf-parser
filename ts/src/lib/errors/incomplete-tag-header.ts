import { Incident } from "incident";

export type Name = "IncompleteTagHeader";
export const name: Name = "IncompleteTagHeader";

export interface Data {
}

export type Cause = undefined;
export type IncompleteTagHeaderError = Incident<Data, Name, Cause>;

export function format(_: Data) {
  return "Failed to parse tag header: Not enough data";
}

export function createIncompleteTagHeaderError(): IncompleteTagHeaderError {
  return new Incident(name, {}, format);
}
