import {DocumentType, Int32Type} from "kryo";
import {Ufixed8P8} from "../fixed-point/ufixed8p8";
import {Uint16} from "../integer-names";
import {Rect} from "./rect";
import {SwfSignature} from "./swf-signature";

export interface SwfHeader extends SwfSignature {
  frameSize: Rect;
  frameRate: Ufixed8P8;
  frameCount: Uint16;
}

export namespace SwfHeader {
  export interface Json extends SwfSignature.Json {
    "frame-size": Rect.Json;
    "frame-rate": number;
    "frame-count": number;
  }

  export const type: DocumentType<SwfHeader> = new DocumentType<SwfHeader>({
    properties: {
      ...SwfSignature.type.properties,
      frameSize: {type: Rect.type},
      frameRate: {type: Ufixed8P8.type},
      frameCount: {type: new Int32Type()}
    },
    rename: SwfSignature.type.rename
  });
}
