use swf_tree as ast;
use nom::IResult;
use nom::{le_u8 as parse_u8, le_u16 as parse_le_u16, le_u32 as parse_le_u32};
use parsers::basic_data_types::{parse_le_ufixed8_p8, parse_rect};

pub fn parse_compression_method(input: &[u8]) -> IResult<&[u8], ast::CompressionMethod> {
  alt!(
    input,
    tag!("FWS") => {|_| ast::CompressionMethod::None}
  | tag!("CWS") => {|_| ast::CompressionMethod::Deflate}
  | tag!("ZWS") => {|_| ast::CompressionMethod::Lzma}
  // TODO(demurgos): Throw error if none matches
  )
}

pub fn parse_swf_signature(input: &[u8]) -> IResult<&[u8], ast::SwfSignature> {
  do_parse!(
    input,
    compression_method: parse_compression_method >>
    swf_version: parse_u8 >>
    uncompressed_file_length: map!(parse_le_u32, |x| x as usize) >>
    (ast::SwfSignature {
      compression_method: compression_method,
      swf_version: swf_version,
      uncompressed_file_length: uncompressed_file_length,
    })
  )
}


pub fn parse_header(input: &[u8]) -> IResult<&[u8], ast::Header> {
  do_parse!(
    input,
    signature: parse_swf_signature >>
    frame_size: parse_rect >>
    frame_rate: parse_le_ufixed8_p8 >>
    frame_count: parse_le_u16 >>
    (ast::Header {
      compression_method: signature.compression_method,
      swf_version: signature.swf_version,
      uncompressed_file_length: signature.uncompressed_file_length,
      frame_size: frame_size,
      frame_rate: frame_rate,
      frame_count: frame_count,
    })
  )
}

#[cfg(test)]
mod tests {
  use nom;
  use super::*;

  #[test]
  fn test_parse_compression_method() {
    assert_eq!(parse_compression_method(&b"FWS"[..]), nom::IResult::Done(&[][..], ast::CompressionMethod::None));
    assert_eq!(parse_compression_method(&b"CWS"[..]), nom::IResult::Done(&[][..], ast::CompressionMethod::Deflate));
    assert_eq!(parse_compression_method(&b"ZWS"[..]), nom::IResult::Done(&[][..], ast::CompressionMethod::Lzma));
  }

  #[test]
  fn test_parse_swf_header_signature() {
    assert_eq!(
      parse_swf_signature(&b"FWS\x0f\x08\x00\x00\x00"[..]),
      nom::IResult::Done(
        &[][..],
        ast::SwfSignature {
          compression_method: ast::CompressionMethod::None,
          swf_version: 15u8,
          uncompressed_file_length: 8
        }
      )
    );
    assert_eq!(
      parse_swf_signature(&b"CWS\x0f\x08\x00\x00\x00"[..]),
      nom::IResult::Done(
        &[][..],
        ast::SwfSignature {
          compression_method: ast::CompressionMethod::Deflate,
          swf_version: 15u8,
          uncompressed_file_length: 8
        }
      )
    );

    assert_eq!(
      parse_swf_signature(&b"\x43\x57\x53\x08\xac\x05\x00\x00"[..]),
      nom::IResult::Done(
        &[][..],
        ast::SwfSignature {
          compression_method: ast::CompressionMethod::Deflate,
          swf_version: 8u8,
          uncompressed_file_length: 1452
        }
      )
    );
  }
}
