import {CaseStyle, DocumentType, Int32Type} from "kryo";
import {Int16} from "../integer-names";

export interface Rect {
  xMin: Int16;
  xMax: Int16;
  yMin: Int16;
  yMax: Int16;
}

export namespace Rect {
  export interface Json {
    "x-min": number;
    "x-max": number;
    "y-min": number;
    "y-max": number;
  }

  export const type: DocumentType<Rect> = new DocumentType<Rect>({
    properties: {
      xMin: {
        type: new Int32Type()
      },
      xMax: {
        type: new Int32Type()
      },
      yMin: {
        type: new Int32Type()
      },
      yMax: {
        type: new Int32Type()
      }
    },
    rename: CaseStyle.KebabCase
  });
}
