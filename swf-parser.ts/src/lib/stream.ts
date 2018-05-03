import { Incident } from "incident";
import { Float16, Float32, Float64, Sint16, Sint32, Sint8, Uint16, Uint32, Uint8, UintSize } from "semantic-types";
import { Sfixed16P16, Sfixed8P8, Ufixed16P16, Ufixed8P8 } from "swf-tree";
import { createIncompleteStreamError } from "./errors/incomplete-stream";

/**
 * Represents a non-byte-aligned stream
 */
export interface BitStream {
  bytePos: UintSize;
  bitPos: UintSize;

  align(): void;

  asByteStream(): ByteStream;

  skipBits(n: UintSize): void;

  readBoolBits(): boolean;

  readSint16Bits(n: UintSize): Sint16;

  readSint32Bits(n: UintSize): Sint32;

  readUint16Bits(n: UintSize): Uint16;

  readUint32Bits(n: UintSize): Uint32;

  readSfixed16P16Bits(n: UintSize): Sfixed16P16;
}

/**
 * Represents a byte-aligned stream
 */
export interface ByteStream {
  bytePos: UintSize;

  skip(size: UintSize): void;

  align(): void;

  available(): UintSize;

  tailBytes(): Uint8Array;

  asBitStream(): BitStream;

  take(length: UintSize): ByteStream;

  takeBytes(length: UintSize): Uint8Array;

  readString(byteLength: UintSize): string;

  readCString(): string;

  readUint8(): Uint8;

  peekUint8(): Uint8;

  readUint16BE(): Uint16;

  readUint16LE(): Uint16;

  readUint32BE(): Uint32;

  readUint32LE(): Uint32;

  readUint32Leb128(): Uint32;

  readSint8(): Sint8;

  readSint16LE(): Sint16;

  readSint32LE(): Sint32;

  /**
   * You probably don't want to use this but Float16LE for SWF files.
   */
  readFloat16BE(): Float16;

  readFloat16LE(): Float16;

  /**
   * You probably don't want to use this but Float32LEfor SWF files.
   */
  readFloat32BE(): Float32;

  readFloat32LE(): Float32;

  /**
   * You probably don't want to use this but Float64LEfor SWF files.
   */
  readFloat64BE(): Float64;

  readFloat64LE(): Float64;

  readFixed8P8LE(): Sfixed8P8;

  readUfixed8P8LE(): Ufixed8P8;

  readFixed16P16LE(): Sfixed16P16;

  readUfixed16P16LE(): Ufixed16P16;
}

export class Stream implements BitStream, ByteStream {
  bytes: Uint8Array;
  view: DataView;
  bytePos: UintSize;
  byteEnd: UintSize;
  bitPos: UintSize;

  constructor(bytes: Uint8Array, byteOffset: UintSize = 0, bitOffset: UintSize = 0) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    this.bytePos = 0;
    this.bitPos = bitOffset;
    this.byteEnd = bytes.length;
  }

  asBitStream(): this {
    return this;
  }

  asByteStream(): this {
    this.align();
    return this;
  }

  align(): void {
    if (this.bitPos !== 0) {
      this.bitPos = 0;
      this.bytePos++;
    }
  }

  tail(): Stream {
    return new Stream(this.tailBytes(), 0, this.bitPos);
  }

  tailBytes(): Uint8Array {
    const result: Uint8Array = this.bytes.subarray(this.bytePos);
    this.bytePos = this.byteEnd;
    this.bitPos = 0;
    return result;
  }

  available(): number {
    return this.byteEnd - this.bytePos;
  }

  take(length: UintSize): Stream {
    return new Stream(this.takeBytes(length), 0, 0);
  }

  takeBytes(length: UintSize): Uint8Array {
    const result: Uint8Array = this.bytes.subarray(this.bytePos, this.bytePos + length);
    this.bytePos += length;
    this.bitPos = 0;
    return result;
  }

  readSint8(): Sint8 {
    return this.view.getInt8(this.bytePos++);
  }

  readSint16LE(): Sint16 {
    const result: Sint16 = this.view.getInt16(this.bytePos, true);
    this.bytePos += 2;
    return result;
  }

  readSint32LE(): Sint32 {
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

  readUint16BE(): Uint16 {
    const result: Uint16 = this.view.getUint16(this.bytePos, false);
    this.bytePos += 2;
    return result;
  }

  readUint16LE(): Uint16 {
    const result: Uint16 = this.view.getUint16(this.bytePos, true);
    this.bytePos += 2;
    return result;
  }

  readUint32BE(): Uint32 {
    const result: Uint32 = this.view.getUint32(this.bytePos, false);
    this.bytePos += 4;
    return result;
  }

  readUint32LE(): Uint32 {
    const result: Uint32 = this.view.getUint32(this.bytePos, true);
    this.bytePos += 4;
    return result;
  }

  readFloat16BE(): Float16 {
    const u16: Uint16 = this.view.getUint16(this.bytePos, false);
    this.bytePos += 2;
    return reinterpretUint16AsFloat16(u16);
  }

  readFloat16LE(): Float16 {
    const u16: Uint16 = this.view.getUint16(this.bytePos, true);
    this.bytePos += 2;
    return reinterpretUint16AsFloat16(u16);
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

  readFixed8P8LE(): Sfixed8P8 {
    return Sfixed8P8.fromEpsilons(this.readSint16LE());
  }

  readUfixed8P8LE(): Ufixed8P8 {
    return Ufixed8P8.fromEpsilons(this.readUint16LE());
  }

  readFixed16P16LE(): Sfixed16P16 {
    return Sfixed16P16.fromEpsilons(this.readSint32LE());
  }

  readUfixed16P16LE(): Ufixed16P16 {
    return Ufixed16P16.fromEpsilons(this.readUint32LE());
  }

  skip(size: UintSize): void {
    this.bytePos += size;
  }

  skipBits(n: number): void {
    this.readUintBits(n);
  }

  readBoolBits(): boolean {
    return this.readUintBits(1) > 0;
  }

  readSint16Bits(n: number): Sint16 {
    return this.readIntBits(n);
  }

  /**
   * SB[n]
   */
  readSint32Bits(n: UintSize): Sint32 {
    return this.readIntBits(n);
  }

  readUint16Bits(n: UintSize): Uint16 {
    return this.readUintBits(n);
  }

  /**
   * UB[n]
   */
  readUint32Bits(n: UintSize): Uint32 {
    return this.readUintBits(n);
  }

  readSfixed16P16Bits(n: number): Sfixed16P16 {
    return Sfixed16P16.fromEpsilons(this.readIntBits(n));
  }

  /**
   * LEB128-encoded Uint32 (1 to 5 bytes)
   */
  readUint32Leb128(): Uint32 {
    let result: Uint32 = 0;
    for (let i: number = 0; i < 5; i++) {
      const nextByte: Uint8 = this.bytes[this.bytePos++];
      if (i < 4) {
        // Bit-shift is safe
        result += (nextByte & 0x7f) << (7 * i);
      } else {
        // Bit-shift is unsafe, use `* Math.pow`
        result += (nextByte & 0x0f) * Math.pow(2, 28);
      }
      if ((nextByte & (1 << 7)) === 0) {
        return result;
      }
    }
    return result;
  }

  readString(byteLength: number): string {
    const endOfString: number = this.bytePos + byteLength;
    if (endOfString > this.bytes.length) {
      throw createIncompleteStreamError();
    }
    // TODO(demurgos): Remove type cast
    const strBuffer: Buffer = Buffer.from(this.bytes.subarray(this.bytePos, endOfString) as Buffer);
    const result: string = strBuffer.toString("utf8");
    this.bytePos = endOfString;
    return result;
  }

  readCString(): string {
    const endOfString: number = this.bytes.indexOf(0, this.bytePos);
    if (endOfString < 0) {
      throw createIncompleteStreamError();
    }
    // TODO(demurgos): Remove type cast
    const strBuffer: Buffer = Buffer.from(this.bytes.subarray(this.bytePos, endOfString) as Buffer);
    const result: string = strBuffer.toString("utf8");
    this.bytePos = endOfString + 1;
    return result;
  }

  private readUintBits(n: number): number {
    if (n > 32) {
      // Even if we could read up to 53 bits, we restrict it to 32 bits (which is already unsafe
      // if we consider that the max positive number safe regarding bit operations is 2^31 - 1)
      throw new Incident("BitOverflow", "Cannot read above 32 bits without overflow");
    }
    let result: number = 0;
    while (n > 0) {
      if (this.bitPos + n < 8) {
        const endBitPos: number = this.bitPos + n;
        const shift: number = 1 << (endBitPos - this.bitPos);
        const cur: number = (this.bytes[this.bytePos] >>> 8 - endBitPos) & (shift - 1);
        result = result * shift + cur;
        n = 0;
        this.bitPos = endBitPos;
      } else {
        const shift: number = 1 << (8 - this.bitPos);
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

  static equals(left: Stream, right: Stream): boolean {
    if (left.bitPos !== right.bitPos) {
      return false;
    }
    const leftLen = left.byteEnd - left.bytePos;
    const rightLen = right.byteEnd - right.bytePos;
    if (leftLen !== rightLen) {
      return false;
    } else if (leftLen === 0) {
      return true;
    }
    let i: number = 0;
    if (left.bitPos !== 0) {
      i = 1;
      const leftPartialByte = left.bytes[left.bytePos];
      const rightPartialByte = right.bytes[right.bytePos];
      const mask = (1 << (8 - left.bitPos)) - 1;
      if ((leftPartialByte & mask) !== (rightPartialByte & mask)) {
        return false;
      }
    }
    for (; i < leftLen; i++) {
      if (left.bytes[left.bytePos + i] !== right.bytes[right.bytePos + i]) {
        return false;
      }
    }
    return true;
  }
}

function reinterpretUint16AsFloat16(u16: Uint16): Float16 {
  const sign: -1 | 1 = (u16 & (1 << 15)) !== 0 ? -1 : 1;
  const exponent: Sint32 = (u16 & 0x7c00) >>> 10; // 0x7c00: bits 10 to 14 (inclusive)
  const fraction: Float64 = u16 & 0x03ff; // 0x03ff: bits 0 to 9 (inclusive)
  if (exponent === 0) {
    return sign * Math.pow(2, -14) * (fraction / 1024);
  } else if (exponent === 0x1f) { // 0x1f: bits 0 to 4 (inclusive)
    return fraction === 0 ? sign * Infinity : NaN;
  } else {
    return sign * Math.pow(2, exponent - 15) * (1 + (fraction / 1024));
  }
}
