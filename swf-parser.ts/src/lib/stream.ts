import {Incident} from "incident";
import {
  Float16,
  Float32,
  Float64,
  Sint16,
  Sint32,
  Sint8,
  Uint16,
  Uint32,
  Uint8,
} from "semantic-types";
import {Fixed16P16, Fixed8P8, Ufixed16P16, Ufixed8P8} from "swf-tree";
import {IncompleteStreamError} from "./errors/incomplete-stream";

export class Stream {
  bytes: Uint8Array;
  view: DataView;
  bytePos: number;
  byteEnd: number;
  bitPos: number;

  constructor(buffer: ArrayBuffer | Buffer, byteOffset: number = 0, bitOffset: number = 0) {
    if (buffer instanceof Buffer) {
      buffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
    this.bytes = new Uint8Array(buffer, byteOffset, buffer.byteLength);
    this.view = new DataView(buffer, byteOffset, buffer.byteLength);
    this.bytePos = 0;
    this.bitPos = bitOffset;
    this.byteEnd = buffer.byteLength;
  }

  align() {
    if (this.bitPos !== 0) {
      this.bitPos = 0;
      this.bytePos++;
    }
  }

  tail(): Stream {
    return new Stream(this.bytes.buffer.slice(this.bytePos), 0, this.bitPos);
  }

  available(): number {
    return this.byteEnd - this.bytePos;
  }

  toBuffer(): Buffer {
    return Buffer.from(this.bytes.buffer.slice(this.bytePos, this.byteEnd));
  }

  take(length: number): Stream {
    const result: Stream = new Stream(this.bytes.buffer.slice(this.bytePos, this.bytePos + length), 0, 0);
    this.bytePos += length;
    return result;
  }

  substream(byteStart: number, byteEnd: number): Stream {
    const result: Stream = new Stream(this.bytes.buffer, byteStart, 0);
    result.byteEnd = byteEnd;
    return result;
  }

  readInt8(): Sint8 {
    return this.view.getInt8(this.bytePos++);
  }

  readInt16LE(): Sint16 {
    const result: Sint16 = this.view.getInt16(this.bytePos, true);
    this.bytePos += 2;
    return result;
  }

  readInt32LE(): Sint32 {
    const result: Sint32 = this.view.getInt32(this.bytePos, true);
    this.bytePos += 4;
    return result;
  }

  readUint8(): Uint8 {
    return this.view.getUint8(this.bytePos++);
  }

  peekUint8(): Uint8 {
    return this.view.getUint8(this.bytePos);
  }

  readUint16LE(): Uint16 {
    const result: Uint16 = this.view.getUint16(this.bytePos, true);
    this.bytePos += 2;
    return result;
  }

  readUint32LE(): Uint32 {
    const result: Uint32 = this.view.getUint32(this.bytePos, true);
    this.bytePos += 4;
    return result;
  }

  readFloat16BE(): Float16 {
    const u16: Uint16 = this.view.getUint16(0, false);
    const sign: -1 | 1 = u16 >> 15 === 1 ? -1 : 1;
    const exponent: number = (u16 & 0x7c00) >> 10; // 0x7c00: bits 10 to 14 (inclusive)
    const fraction: number = u16 & 0x03ff; // 0x03ff: bits 0 to 9 (inclusive)
    if (exponent === 0) {
      return sign * Math.pow(2, -14) * (fraction / 1024);
    } else if (exponent === 0x1f) { // 0x1f: bits 0 to 4 (inclusive)
      return fraction === 0 ? sign * Infinity : NaN;
    } else {
      return sign * Math.pow(2, exponent - 15) * (1 + (fraction / 1024));
    }
  }

  readFloat32BE(): Float32 {
    const result: Float32 = this.view.getFloat32(this.bytePos, false);
    this.bytePos += 4;
    return result;
  }

  readFloat32LE(): Float32 {
    const result: Float32 = this.view.getFloat32(this.bytePos, true);
    this.bytePos += 4;
    return result;
  }

  readFloat64BE(): Float64 {
    const result: Float64 = this.view.getFloat64(this.bytePos, false);
    this.bytePos += 8;
    return result;
  }

  readFloat64LE(): Float64 {
    const result: Float64 = this.view.getFloat64(this.bytePos, true);
    this.bytePos += 8;
    return result;
  }

  readFixed8P8LE(): Fixed8P8 {
    return Fixed8P8.fromEpsilons(this.readInt16LE());
  }

  readUfixed8P8LE(): Ufixed8P8 {
    return Ufixed8P8.fromEpsilons(this.readUint16LE());
  }

  readFixed16P16LE(): Fixed16P16 {
    return Fixed16P16.fromEpsilons(this.readInt32LE());
  }

  readUfixed16P16LE(): Ufixed16P16 {
    return Ufixed16P16.fromEpsilons(this.readUint32LE());
  }

  skip(size: number): void {
    this.bytePos += size;
  }

  skipBits(n: number): void {
    // TODO(demurgos): Reverse the dependency between skipBits and readUintBits
    this.readUintBits(n);
  }

  readBoolBits(): boolean {
    return this.readUintBits(1) > 0;
  }

  readInt16Bits(n: number): Sint16 {
    return this.readIntBits(n);
  }

  readInt32Bits(n: number): Sint32 {
    return this.readIntBits(n);
  }

  readUint16Bits(n: number): Uint16 {
    return this.readUintBits(n);
  }

  readFixed16P16Bits(n: number): Fixed16P16 {
    return Fixed16P16.fromEpsilons(this.readIntBits(n));
  }

  readEncodedUint32LE(): Uint32 {
    let result: Uint32 = 0;
    for (let i: number = 0; i < 5; i++) {
      const nextByte: Uint8 = this.bytes[this.bytePos++];
      if (i === 4) {
        // Only read 4 bits, do not use bitwise operations (JS would convert it to Int32)
        result += (nextByte & 0x0f) * Math.pow(2, 28);
      } else {
        result += (nextByte & 0x7f) << (7 * i);
      }
      if (((nextByte >> 7) & 1) === 0) {
        return result;
      }
    }
    return result;
  }

  readCString(): string {
    const endOfString: number = this.bytes.indexOf(0, this.bytePos);
    if (endOfString < this.bytePos) {
      throw IncompleteStreamError.create();
    }
    const strBuffer: Buffer = Buffer.from(this.bytes.buffer, this.bytePos, endOfString - this.bytePos);
    const result: string = strBuffer.toString("utf8");
    this.bytePos = endOfString + 1;
    return result;
  }

  private readUintBits(n: number): number {
    if (n > 32) {
      throw new Incident("BitOverflow", "Cannot read above 32 bits without overflow");
    }
    let result: number = 0;
    while (n > 0) {
      if (this.bitPos + n < 8) {
        const endBitPos: number = this.bitPos + n;
        const shift: number = 1 << endBitPos - this.bitPos;
        const cur: number = (this.bytes[this.bytePos] >>> 8 - endBitPos) & (shift - 1);
        result = result * shift + cur;
        n = 0;
        this.bitPos = endBitPos;
      } else {
        const shift: number = 1 << 8 - this.bitPos;
        const cur: number = this.bytes[this.bytePos] & (shift - 1);
        result = result * shift + cur;
        n -= (8 - this.bitPos);
        this.bitPos = 0;
        this.bytePos++;
      }
    }
    return result;
  }

  private readIntBits(n: number): number {
    if (n === 0) {
      return 0;
    }
    const unsigned: number = this.readUintBits(n);
    if (unsigned < Math.pow(2, n - 1)) {
      return unsigned;
    } else {
      return -Math.pow(2, n) + unsigned;
    }
  }
}

export default Stream;
