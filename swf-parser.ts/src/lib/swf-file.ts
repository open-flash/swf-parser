import {SwfFile as AstSwfFile} from "swf-tree";

export interface SwfFile extends AstSwfFile {
  uri?: string;
}
