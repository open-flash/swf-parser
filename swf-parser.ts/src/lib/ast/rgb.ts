import {CaseStyle, DocumentType, Int32Type} from "kryo";
import {Uint8} from "../integer-names";

export interface Rgb {
  r: Uint8;
  g: Uint8;
  b: Uint8;
}

export namespace Rgb {
  export interface Json {
    r: number;
    g: number;
    b: number;
  }

  export const type: DocumentType<Rgb> = new DocumentType<Rgb>({
    properties: {
      r: {type: new Int32Type()},
      g: {type: new Int32Type()},
      b: {type: new Int32Type()},
    },
    rename: CaseStyle.KebabCase
  });
}
