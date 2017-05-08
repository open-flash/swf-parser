export type BytePos = number;
export type BitPos = [number, number];
//
// export class BytePos {
//   pos: number;
// }

export class BitSlice {
  readonly data: Uint8Array;
  pos: number;
  bitPos: number;

  constructor(data: Uint8Array) {
    this.data = data;
    this.pos = 0;
    this.bitPos = 0;
  }

  align(): void {
    if (this.bitPos !== 0) {
      this.bitPos = 0;
      this.pos++;
    }
  }

  skip(n: number): void {

  }
}
