use nom::number::complete::le_u8 as parse_u8;
use nom::IResult as NomResult;
use swf_tree as ast;

pub fn video_deblocking_from_id(video_deblocking_id: u8) -> ast::VideoDeblocking {
  match video_deblocking_id {
    0 => ast::VideoDeblocking::PacketValue,
    1 => ast::VideoDeblocking::Off,
    2 => ast::VideoDeblocking::Level1,
    3 => ast::VideoDeblocking::Level2,
    4 => ast::VideoDeblocking::Level3,
    5 => ast::VideoDeblocking::Level4,
    _ => panic!("Unexpected video deblocking id"),
  }
}

pub fn parse_videoc_codec(input: &[u8]) -> NomResult<&[u8], ast::VideoCodec> {
  let (input, codec_id) = parse_u8(input)?;
  let codec = video_codec_from_id(codec_id);
  Ok((input, codec))
}

pub fn video_codec_from_id(video_codec_id: u8) -> ast::VideoCodec {
  match video_codec_id {
    0 => ast::VideoCodec::None,
    1 => ast::VideoCodec::Jpeg,
    2 => ast::VideoCodec::Sorenson,
    3 => ast::VideoCodec::Screen,
    4 => ast::VideoCodec::Vp6,
    5 => ast::VideoCodec::Vp6Alpha,
    6 => ast::VideoCodec::Screen2,
    7 => ast::VideoCodec::Avc,
    _ => panic!("Unexpected video codec id"),
  }
}
