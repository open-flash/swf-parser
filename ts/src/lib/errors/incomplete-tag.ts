import incident, { Incident } from "incident";

export type Name = "IncompleteTag";
export const name: Name = "IncompleteTag";

export interface Data {
  available: number;
  needed: number;
}

export type Cause = undefined;
export type IncompleteTagError = Incident<Data, Name, Cause>;

export function format({needed, available}: Data) {
  return `Failed to parse tag: Not enough data: ${available} / ${needed} bytes`;
}

export function createIncompleteTagError(available: number, needed: number): IncompleteTagError {
  return new incident.Incident(name, {available, needed}, format);
}
