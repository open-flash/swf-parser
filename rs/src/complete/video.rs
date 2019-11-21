use nom::number::complete::le_u8 as parse_u8;
use nom::IResult as NomResult;
use swf_types as ast;

pub fn video_deblocking_from_code(video_deblocking_id: u8) -> Result<ast::VideoDeblocking, ()> {
  match video_deblocking_id {
    0 => Ok(ast::VideoDeblocking::PacketValue),
    1 => Ok(ast::VideoDeblocking::Off),
    2 => Ok(ast::VideoDeblocking::Level1),
    3 => Ok(ast::VideoDeblocking::Level2),
    4 => Ok(ast::VideoDeblocking::Level3),
    5 => Ok(ast::VideoDeblocking::Level4),
    _ => Err(()),
  }
}

pub fn parse_videoc_codec(input: &[u8]) -> NomResult<&[u8], ast::VideoCodec> {
  let (input, codec_id) = parse_u8(input)?;
  let codec = video_codec_from_code(codec_id).map_err(|_| nom::Err::Error((input, nom::error::ErrorKind::Switch)))?;
  Ok((input, codec))
}

pub fn video_codec_from_code(video_codec_id: u8) -> Result<ast::VideoCodec, ()> {
  match video_codec_id {
    0 => Ok(ast::VideoCodec::None),
    1 => Ok(ast::VideoCodec::Jpeg),
    2 => Ok(ast::VideoCodec::Sorenson),
    3 => Ok(ast::VideoCodec::Screen),
    4 => Ok(ast::VideoCodec::Vp6),
    5 => Ok(ast::VideoCodec::Vp6Alpha),
    6 => Ok(ast::VideoCodec::Screen2),
    7 => Ok(ast::VideoCodec::Avc),
    _ => Err(()),
  }
}
