import { ReadableByteStream } from "@open-flash/stream";
import { Incident } from "incident";
import { Uint16, Uint2, Uint32, Uint4, Uint8, UintSize } from "semantic-types";
import { AudioCodingFormat } from "swf-tree/sound/audio-coding-format";
import { SoundEnvelope } from "swf-tree/sound/sound-envelope";
import { SoundInfo } from "swf-tree/sound/sound-info";
import { SoundRate } from "swf-tree/sound/sound-rate";

export function getSoundRateFromCode(soundRateCode: Uint2): SoundRate {
  switch (soundRateCode) {
    case 0:
      return 5500;
    case 1:
      return 11000;
    case 2:
      return 22000;
    case 3:
      return 44000;
    default:
      throw new Incident("UnexpectedSoundRateCode", {code: soundRateCode});
  }
}

export function getAudioCodingFormatFromCode(formatCode: Uint4): AudioCodingFormat {
  switch (formatCode) {
    case 0:
      return AudioCodingFormat.UncompressedNativeEndian;
    case 1:
      return AudioCodingFormat.Adpcm;
    case 2:
      return AudioCodingFormat.Mp3;
    case 3:
      return AudioCodingFormat.UncompressedLittleEndian;
    case 4:
      return AudioCodingFormat.Nellymoser16;
    case 5:
      return AudioCodingFormat.Nellymoser8;
    case 6:
      return AudioCodingFormat.Nellymoser;
    case 11:
      return AudioCodingFormat.Speex;
    default:
      throw new Incident("UnexpectedFormatCode", {code: formatCode});
  }
}

export function isUncompressedAudioCodingFormat(format: AudioCodingFormat): boolean {
  return format === AudioCodingFormat.UncompressedNativeEndian || format === AudioCodingFormat.UncompressedLittleEndian;
}

export function parseSoundInfo(byteStream: ReadableByteStream): SoundInfo {
  const flags: Uint8 = byteStream.readUint8();

  const hasInPoint: boolean = (flags & (1 << 0)) !== 0;
  const hasOutPoint: boolean = (flags & (1 << 1)) !== 0;
  const hasLoops: boolean = (flags & (1 << 2)) !== 0;
  const hasEnvelope: boolean = (flags & (1 << 3)) !== 0;
  const syncNoMultiple: boolean = (flags & (1 << 4)) !== 0;
  const syncStop: boolean = (flags & (1 << 6)) !== 0;
  // Bits [6, 7] are reserved

  const inPoint: Uint32 | undefined = hasInPoint ? byteStream.readUint32LE() : undefined;
  const outPoint: Uint32 | undefined = hasOutPoint ? byteStream.readUint32LE() : undefined;
  const loopCount: Uint16 | undefined = hasLoops ? byteStream.readUint16LE() : undefined;
  let envelopeRecords: SoundEnvelope[] | undefined;
  if (hasEnvelope) {
    envelopeRecords = [];
    const recordCount: UintSize = byteStream.readUint8();
    for (let i: UintSize = 0; i < recordCount; i++) {
      envelopeRecords.push(parseSoundEnvelope(byteStream));
    }
  }

  return {syncStop, syncNoMultiple, inPoint, outPoint, loopCount, envelopeRecords};
}

export function parseSoundEnvelope(byteStream: ReadableByteStream): SoundEnvelope {
  const pos44: Uint32 = byteStream.readUint32LE();
  const leftLevel: Uint16 = byteStream.readUint16LE();
  const rightLevel: Uint16 = byteStream.readUint16LE();
  return {pos44, leftLevel, rightLevel};
}
