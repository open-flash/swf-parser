import {SwfFile} from "../ast/swf-file";
import {SwfHeader} from "../ast/swf-header";
import {SwfTag} from "../ast/swf-tag";
import {Stream} from "../stream";
import {parseSwfHeader} from "./header";
import {parseSwfTag} from "./swf-tags";
import {SwfTagType} from "../ast/swf-tag-type";

export function parseDecompressedSwfFile(byteStream: Stream): SwfFile {
  const header: SwfHeader = parseSwfHeader(byteStream);
  const tags: SwfTag[] = [];
  let cur: SwfTag;
  do {
    cur = parseSwfTag(byteStream);
    tags.push(cur);
  } while (cur.type !== SwfTagType.End);
  return {header, tags};
}

export function parseSwfFile(byteStream: Stream): SwfFile {
  return parseDecompressedSwfFile(byteStream);
}
