import {ArrayType, CaseStyle, DocumentType} from "kryo";
import {SwfHeader} from "./swf-header";
import {SwfTag} from "./swf-tag";

export interface SwfFile {
  header: SwfHeader;
  tags: SwfTag[];
}

export namespace SwfFile {
  export interface Json {
    header: SwfHeader.Json;
    tags: SwfTag.Json[];
  }

  export const type: DocumentType<SwfFile> = new DocumentType<SwfFile>({
    properties: {
      header: {type: SwfHeader.type},
      tags: {type: new ArrayType({itemType: SwfTag.type, maxLength: Infinity})},
    },
    rename: CaseStyle.KebabCase
  });
}
