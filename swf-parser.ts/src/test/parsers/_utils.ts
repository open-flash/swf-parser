import { Incident } from "incident";
import { Stream } from "../../lib/stream";

export interface StreamJson {
  buffer: string;
  bytePos?: number;
  bitPos?: number;
}

export function readBufferString(buffer: string): Buffer {
  if (buffer === "") {
    return new Buffer(0);
  } else if (buffer.startsWith("0b")) {
    const binaryString: string = buffer.substr(2).replace(/[^01]/g, "");
    if (binaryString.length % 8 !== 0) {
      throw new Incident("InvalidBufferString", "Binary format [01] count is not a multiple of 8");
    }
    const len: number = binaryString.length / 8;
    const result: Buffer = Buffer.alloc(len);
    for (let i: number = 0; i < len; i++) {
      let byte: number = 0;
      for (let j: number = 0; j < 8; j++) {
        if (binaryString[8 * i + j] === "1") {
          byte |= 1 << (7 - j);
        }
      }
      result[i] = byte;
    }
    return result;
  } else if (buffer.startsWith("0x")) {
    const hexString: string = buffer.substr(2).replace(/[^0-9a-f]/g, "");
    if (hexString.length % 2 !== 0) {
      throw new Incident("InvalidBufferString", "Hex format [0-9a-f] count is not a multiple of 2");
    }
    return Buffer.from(hexString, "hex");
  } else {
    throw new Incident("InvalidBufferString", "Unknown buffer string format");
  }
}

export function readStreamJson(input: StreamJson): Stream {
  const buffer: Buffer = readBufferString(input.buffer);
  return new Stream(buffer, input.bytePos, input.bitPos);
}
