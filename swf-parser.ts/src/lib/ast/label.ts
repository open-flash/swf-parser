import {CaseStyle, DocumentType, Int32Type, Ucs2StringType} from "kryo";

export interface Label {
  frame: number;
  name: string;
}

export namespace Label {
  export interface Json {
    frame: number;
    name: string;
  }

  export const type: DocumentType<Label> = new DocumentType<Label>({
    properties: {
      frame: {type: new Int32Type()},
      name: {type: new Ucs2StringType({maxLength: Infinity})}
    },
    rename: CaseStyle.KebabCase
  });
}
