import { ReadableByteStream } from "@open-flash/stream";
import incident from "incident";
import { Uint3, Uint8 } from "semantic-types";
import { VideoCodec } from "swf-types/video/video-codec";
import { VideoDeblocking } from "swf-types/video/video-deblocking";

export function getVideoDeblockingFromCode(videoDeblockingCode: Uint3): VideoDeblocking {
  switch (videoDeblockingCode) {
    case 0:
      return VideoDeblocking.PacketValue;
    case 1:
      return VideoDeblocking.Off;
    case 2:
      return VideoDeblocking.Level1;
    case 3:
      return VideoDeblocking.Level2;
    case 4:
      return VideoDeblocking.Level3;
    case 5:
      return VideoDeblocking.Level4;
    default:
      throw new incident.Incident("UnexpectedVideoDeblockingCode", {code: videoDeblockingCode});
  }
}

export function parseVideoCodec(byteStream: ReadableByteStream): VideoCodec {
  return getVideoCodecFromCode(byteStream.readUint8());
}

export function getVideoCodecFromCode(videoCodecCode: Uint8): VideoCodec {
  switch (videoCodecCode) {
    case 0:
      return VideoCodec.None;
    case 1:
      return VideoCodec.Jpeg;
    case 2:
      return VideoCodec.Sorenson;
    case 3:
      return VideoCodec.Screen;
    case 4:
      return VideoCodec.Vp6;
    case 5:
      return VideoCodec.Vp6Alpha;
    case 6:
      return VideoCodec.Screen2;
    case 7:
      return VideoCodec.Avc;
    default:
      throw new incident.Incident("UnexpectedVideoCodecCode", {code: videoCodecCode});
  }
}
