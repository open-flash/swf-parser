import { Incident } from "incident";
import { SoundRate } from "swf-tree/sound/sound-rate";
import { Uint2, Uint4 } from "semantic-types";
import { AudioCodingFormat } from "swf-tree/sound/audio-coding-format";

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
