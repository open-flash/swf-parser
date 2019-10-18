use nom::number::streaming::{le_u16 as parse_le_u16, le_u32 as parse_le_u32, le_u8 as parse_u8};
use nom::IResult;
use std::convert::TryFrom;
use swf_tree as ast;

use crate::parsers::basic_data_types::{parse_le_ufixed8_p8, parse_rect};

pub fn parse_compression_method(input: &[u8]) -> IResult<&[u8], ast::CompressionMethod> {
  use nom::bytes::streaming::take;
  let (input, tag) = take(3usize)(input)?;
  match tag {
    b"FWS" => Ok((input, ast::CompressionMethod::None)),
    b"CWS" => Ok((input, ast::CompressionMethod::Deflate)),
    b"ZWS" => Ok((input, ast::CompressionMethod::Lzma)),
    _ => return Err(nom::Err::Error((input, nom::error::ErrorKind::Switch))),
  }
}

pub fn parse_swf_signature(input: &[u8]) -> IResult<&[u8], ast::SwfSignature> {
  use nom::combinator::map;

  let (input, compression_method) = parse_compression_method(input)?;
  let (input, swf_version) = parse_u8(input)?;
  let (input, uncompressed_file_length) = map(parse_le_u32, |x| usize::try_from(x).unwrap())(input)?;

  Ok((
    input,
    ast::SwfSignature {
      compression_method,
      swf_version,
      uncompressed_file_length,
    },
  ))
}

pub fn parse_header(input: &[u8], swf_version: u8) -> IResult<&[u8], ast::Header> {
  let (input, frame_size) = parse_rect(input)?;
  let (input, frame_rate) = parse_le_ufixed8_p8(input)?;
  let (input, frame_count) = parse_le_u16(input)?;

  Ok((
    input,
    ast::Header {
      swf_version,
      frame_size,
      frame_rate,
      frame_count,
    },
  ))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_parse_compression_method() {
    assert_eq!(
      parse_compression_method(&b"FWS"[..]),
      Ok((&[][..], ast::CompressionMethod::None))
    );
    assert_eq!(
      parse_compression_method(&b"CWS"[..]),
      Ok((&[][..], ast::CompressionMethod::Deflate))
    );
    assert_eq!(
      parse_compression_method(&b"ZWS"[..]),
      Ok((&[][..], ast::CompressionMethod::Lzma))
    );
  }

  #[test]
  fn test_parse_swf_header_signature() {
    assert_eq!(
      parse_swf_signature(&b"FWS\x0f\x08\x00\x00\x00"[..]),
      Ok((
        &[][..],
        ast::SwfSignature {
          compression_method: ast::CompressionMethod::None,
          swf_version: 15u8,
          uncompressed_file_length: 8,
        }
      ))
    );
    assert_eq!(
      parse_swf_signature(&b"CWS\x0f\x08\x00\x00\x00"[..]),
      Ok((
        &[][..],
        ast::SwfSignature {
          compression_method: ast::CompressionMethod::Deflate,
          swf_version: 15u8,
          uncompressed_file_length: 8,
        }
      ))
    );

    assert_eq!(
      parse_swf_signature(&b"\x43\x57\x53\x08\xac\x05\x00\x00"[..]),
      Ok((
        &[][..],
        ast::SwfSignature {
          compression_method: ast::CompressionMethod::Deflate,
          swf_version: 8u8,
          uncompressed_file_length: 1452,
        }
      ))
    );
  }
}
