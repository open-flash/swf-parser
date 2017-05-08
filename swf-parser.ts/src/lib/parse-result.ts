export enum Type {
  Done,
  Incomplete,
  Error
}

export interface Done<T> {
  type: Type.Done;
  value: T;
}

export interface Incomplete {
  type: Type.Incomplete;
  needed?: number;
}

export interface Error<E extends any /* Incident */> {
  type: Type.Done;
  value: E;
}

export type ParseResult<T, E extends any /* Incident */> = Done<T> | Incomplete | Error<E>;
