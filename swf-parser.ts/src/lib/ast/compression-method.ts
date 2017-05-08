import {CaseStyle, SimpleEnumType} from "kryo";

export enum CompressionMethod {
  None,
  Deflate,
  Lzma
}

export namespace CompressionMethod {
  export type Json = "none" | "deflate" | "lzma";

  export const type: SimpleEnumType<CompressionMethod> = new SimpleEnumType<CompressionMethod>({
    enum: CompressionMethod,
    rename: CaseStyle.KebabCase
  });
}
