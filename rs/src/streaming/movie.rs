use crate::parsers::basic_data_types::{parse_le_ufixed8_p8, parse_rect};
use crate::state::ParseState;
use crate::streaming::tag::parse_tag;
use nom::number::streaming::{le_u16 as parse_le_u16, le_u32 as parse_le_u32, le_u8 as parse_u8};
use nom::{IResult as NomResult, Needed};
use std::convert::TryFrom;
use swf_tree as ast;

pub fn parse_movie(input: &[u8]) -> NomResult<&[u8], ast::Movie> {
  use ::std::io::Write;

  let (input, signature) = parse_swf_signature(input)?;
  match signature.compression_method {
    ast::CompressionMethod::None => parse_movie_payload(input, signature.swf_version),
    ast::CompressionMethod::Deflate => {
      let mut decoder = ::inflate::InflateWriter::from_zlib(Vec::new());
      decoder.write(input).unwrap();
      let payload = decoder.finish().unwrap();

      match parse_movie_payload(&payload[..], signature.swf_version) {
        Ok((_, movie)) => Ok((&[][..], movie)),
        Err(::nom::Err::Error((_, e))) => Err(::nom::Err::Error((&[][..], e))),
        Err(::nom::Err::Failure((_, e))) => Err(::nom::Err::Failure((&[][..], e))),
        Err(::nom::Err::Incomplete(n)) => Err(::nom::Err::Incomplete(n)),
      }
    }
    ast::CompressionMethod::Lzma => unimplemented!(),
  }
}

pub fn parse_swf_signature(input: &[u8]) -> NomResult<&[u8], ast::SwfSignature> {
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

pub fn parse_compression_method(input: &[u8]) -> NomResult<&[u8], ast::CompressionMethod> {
  use nom::bytes::streaming::take;
  let (input, tag) = take(3usize)(input)?;
  match tag {
    b"FWS" => Ok((input, ast::CompressionMethod::None)),
    b"CWS" => Ok((input, ast::CompressionMethod::Deflate)),
    b"ZWS" => Ok((input, ast::CompressionMethod::Lzma)),
    _ => return Err(nom::Err::Error((input, nom::error::ErrorKind::Switch))),
  }
}

pub fn parse_header(input: &[u8], swf_version: u8) -> NomResult<&[u8], ast::Header> {
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

pub fn parse_movie_payload(input: &[u8], swf_version: u8) -> NomResult<&[u8], ast::Movie> {
  let mut state = ParseState::new(swf_version);
  let (input, header) = parse_header(input, swf_version)?;
  let (input, tags) = parse_tag_block_string(input, &mut state)?;

  Ok((input, ast::Movie { header, tags }))
}

pub fn parse_tag_block_string<'a>(mut input: &'a [u8], state: &ParseState) -> NomResult<&'a [u8], Vec<ast::Tag>> {
  let mut result: Vec<ast::Tag> = Vec::new();
  while input.len() > 0 {
    // TODO: Check two bytes ahead?
    // A null byte indicates the end of the string of tags
    if input[0] == 0 {
      input = &input[1..];
      break;
    }
    input = match parse_tag(input, state) {
      Ok((input, swf_tag)) => {
        result.push(swf_tag);
        input
      }
      Err(_) => return Err(::nom::Err::Incomplete(Needed::Unknown)),
    };
  }
  Ok((input, result))
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
