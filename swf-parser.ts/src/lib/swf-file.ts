import {SwfFile as AstSwfFile} from "./ast/swf-file";

export interface SwfFile extends AstSwfFile {
  uri?: string;
}
