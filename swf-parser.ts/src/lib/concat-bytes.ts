import { UintSize } from "semantic-types";

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let totalSize: UintSize = 0;
  for (const chunk of chunks) {
    totalSize += chunk.length;
  }
  const result: Uint8Array = new Uint8Array(totalSize);
  let offset: UintSize = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
