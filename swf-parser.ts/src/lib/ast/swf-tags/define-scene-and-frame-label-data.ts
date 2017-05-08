import {ArrayType, CaseStyle, DocumentType, LiteralType} from "kryo";
import {Label} from "../label";
import {Scene} from "../scene";
import {SwfTagType} from "../swf-tag-type";
import {SwfTagBase} from "./_base";

export interface DefineSceneAndFrameLabelData extends SwfTagBase {
  type: SwfTagType.DefineSceneAndFrameLabelData;
  scenes: Scene[];
  labels: Label[];
}

export namespace DefineSceneAndFrameLabelData {
  export interface Json {
    type: "define-scene-and-frame-label-data";
    scenes: Scene.Json[];
    labels: Label.Json[];
  }

  export const type: DocumentType<DefineSceneAndFrameLabelData> = new DocumentType<DefineSceneAndFrameLabelData>({
    properties: {
      type: {type: new LiteralType({type: SwfTagType.type, value: SwfTagType.DefineSceneAndFrameLabelData})},
      scenes: {type: new ArrayType({itemType: Scene.type, maxLength: Infinity})},
      labels: {type: new ArrayType({itemType: Label.type, maxLength: Infinity})}
    },
    rename: CaseStyle.KebabCase
  });
}
