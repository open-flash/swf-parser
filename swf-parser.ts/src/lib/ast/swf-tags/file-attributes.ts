import {BooleanType, CaseStyle, DocumentType, LiteralType} from "kryo";
import {SwfTagType} from "../swf-tag-type";
import {SwfTagBase} from "./_base";

export interface FileAttributes extends SwfTagBase {
  type: SwfTagType.FileAttributes;
  useDirectBlit: boolean;
  useGpu: boolean;
  hasMetadata: boolean;
  useAs3: boolean;
  noCrossDomainCaching: boolean;
  useRelativeUrls: boolean;
  useNetwork: boolean;
}

export namespace FileAttributes {
  export interface Json {
    type: "file-attributes";
    useDirectBlit: boolean;
    useGpu: boolean;
    hasMetadata: boolean;
    useAs3: boolean;
    noCrossDomainCaching: boolean;
    useRelativeUrls: boolean;
    useNetwork: boolean;
  }

  export const type: DocumentType<FileAttributes> = new DocumentType<FileAttributes>({
    properties: {
      type: {type: new LiteralType({type: SwfTagType.type, value: SwfTagType.FileAttributes})},
      useDirectBlit: {type: new BooleanType()},
      useGpu: {type: new BooleanType()},
      hasMetadata: {type: new BooleanType()},
      useAs3: {type: new BooleanType()},
      noCrossDomainCaching: {type: new BooleanType()},
      useRelativeUrls: {type: new BooleanType()},
      useNetwork: {type: new BooleanType()}
    },
    rename: CaseStyle.KebabCase
  });
}
