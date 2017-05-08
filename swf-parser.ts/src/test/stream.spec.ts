// import {assert} from "chai";
// import {Stream} from "../lib/stream";
//
// function toUint8Array(array: number[]): Uint8Array {
//   const result: Uint8Array = new Uint8Array(array.length);
//   result.set(array);
//   return result;
// }
//
// describe("Stream", function () {
//   it("read empty array", function () {
//     const s: Stream = new Stream();
//     const expected: Uint8Array = toUint8Array([]);
//     const actual: Uint8Array = s.read(0);
//     assert.deepEqual(actual, expected);
//   });
//
//   it("write empty array", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([]));
//     const expected: Uint8Array = toUint8Array([]);
//     const actual: Uint8Array = s.read(0);
//     assert.deepEqual(actual, expected);
//   });
//
//   it("read after multiple writes", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x01, 0x02]));
//     s.write(toUint8Array([0x03]));
//     const expected: Uint8Array = toUint8Array([0x01, 0x02, 0x03]);
//     const actual: Uint8Array = s.read(3);
//     assert.deepEqual(actual, expected);
//   });
//
//   it("read uint8", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x00]));
//     assert.equal(s.readUint8(), 0);
//     s.write(toUint8Array([0xff]));
//     assert.equal(s.readUint8(), 255);
//     s.write(toUint8Array([0x80]));
//     assert.equal(s.readUint8(), 128);
//     s.write(toUint8Array([0x7f]));
//     assert.equal(s.readUint8(), 127);
//     s.write(toUint8Array([0x01]));
//     assert.equal(s.readUint8(), 1);
//   });
//
//   it("read int8", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x00]));
//     assert.equal(s.readInt8(), 0);
//     s.write(toUint8Array([0xff]));
//     assert.equal(s.readInt8(), -1);
//     s.write(toUint8Array([0x80]));
//     assert.equal(s.readInt8(), -128);
//     s.write(toUint8Array([0x7f]));
//     assert.equal(s.readInt8(), 127);
//     s.write(toUint8Array([0x01]));
//     assert.equal(s.readInt8(), 1);
//   });
//
//   it("read uint16", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x23, 0x01]));
//     assert.equal(s.readUint16(), 0x0123);
//     s.write(toUint8Array([0x00, 0x80]));
//     assert.equal(s.readUint16(), 0x8000);
//     s.write(toUint8Array([0x80, 0x00]));
//     assert.equal(s.readUint16(), 0x0080);
//   });
//
//   it("read int16", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x23, 0x01]));
//     assert.equal(s.readInt16(), 0x0123);
//     s.write(toUint8Array([0x00, 0x80]));
//     assert.equal(s.readInt16(), -0x8000);
//     s.write(toUint8Array([0x01, 0x80]));
//     assert.equal(s.readInt16(), -0x7fff);
//     s.write(toUint8Array([0x80, 0x00]));
//     assert.equal(s.readInt16(), 0x0080);
//   });
//
//   it("read uint32", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x67, 0x45, 0x23, 0x01]));
//     assert.equal(s.readUint32(), 0x01234567);
//     s.write(toUint8Array([0x00, 0x00, 0x00, 0x80]));
//     assert.equal(s.readUint32(), 0x80000000);
//     s.write(toUint8Array([0x80, 0x00, 0x00, 0x00, 0x00]));
//     assert.equal(s.readUint32(), 0x00000080);
//   });
//
//   it("read int32", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x67, 0x45, 0x23, 0x01]));
//     assert.equal(s.readInt32(), 0x01234567);
//     s.write(toUint8Array([0x00, 0x00, 0x00, 0x80]));
//     assert.equal(s.readInt32(), -0x80000000);
//     s.write(toUint8Array([0x01, 0x00, 0x00, 0x80]));
//     assert.equal(s.readInt32(), -0x7fffffff);
//     s.write(toUint8Array([0x80, 0x00, 0x00, 0x00, 0x00]));
//     assert.equal(s.readInt32(), 0x00000080);
//   });
//
//   it("read fixed8.8", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x80, 0x07]));
//     assert.equal(s.readFixed8_8(), 7.5);
//   });
//
//   it("read fixed16.16", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x00, 0x80, 0x07, 0x00]));
//     assert.equal(s.readFixed16_16(), 7.5);
//   });
//
//   it("read float16", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x00, 0x00]));
//     assert.equal(s.readFloat16(), 0);
//     s.write(toUint8Array([0x80, 0x00]));
//     assert.equal(s.readFloat16(), 0);
//     s.write(toUint8Array([0x00, 0x01]));
//     assert.equal(s.readFloat16(), Math.pow(2, -24));
//     s.write(toUint8Array([0x80, 0x01]));
//     assert.equal(s.readFloat16(), -Math.pow(2, -24));
//   });
//
//   it("read float32", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x00, 0x00, 0x00, 0x00]));
//     assert.equal(s.readFloat32(), 0);
//     s.write(toUint8Array([0x80, 0x00, 0x00, 0x00]));
//     assert.equal(s.readFloat32(), 0);
//   });
//
//   it("read float64", function () {
//     const s: Stream = new Stream();
//     s.write(toUint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
//     assert.equal(s.readFloat64(), 0);
//     s.write(toUint8Array([0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
//     assert.equal(s.readFloat64(), 0);
//   });
// });
