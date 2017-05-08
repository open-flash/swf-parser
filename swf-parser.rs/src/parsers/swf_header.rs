use ast;
use nom::{le_u8 as parse_u8, le_u16 as parse_le_u16, le_u32 as parse_le_u32};
use parsers::basic_data_types::{parse_le_ufixed8_p8_bits, parse_rect};

named!(
  pub parse_compression_method<ast::CompressionMethod>,
  alt!(
    tag!("FWS") => {|_| ast::CompressionMethod::None}
  | tag!("CWS") => {|_| ast::CompressionMethod::Deflate}
  | tag!("ZWS") => {|_| ast::CompressionMethod::Lzma}
  )
);

named!(
  pub parse_swf_header_signature<ast::SwfHeaderSignature>,
  do_parse!(
    compression_method: parse_compression_method >>
    swf_version: parse_u8 >>
    uncompressed_file_length: parse_le_u32 >>
    (ast::SwfHeaderSignature {
      compression_method: compression_method,
      swf_version: swf_version,
      uncompressed_file_length: uncompressed_file_length as usize,
    })
  )
);

named!(
  pub parse_swf_header<ast::SwfHeader>,
  do_parse!(
    prolog: parse_swf_header_signature >>
    frame_size: parse_rect >>
    frame_rate: parse_le_ufixed8_p8_bits >>
    frame_count: parse_le_u16 >>
    (ast::SwfHeader {
      compression_method: prolog.compression_method,
      swf_version: prolog.swf_version,
      uncompressed_file_length: prolog.uncompressed_file_length,
      frame_size: frame_size,
      frame_rate: frame_rate,
      frame_count: frame_count,
    })
  )
);

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
    parse_swf_header_signature(&b"FWS\x0f\x08\x00\x00\x00"[..]),
    nom::IResult::Done(
      &[][..],
      ast::SwfHeaderSignature {
        compression_method: ast::CompressionMethod::None,
        swf_version: 15u8,
        uncompressed_file_length: 8
      }
    )
    );
    assert_eq!(
    parse_swf_header_signature(&b"CWS\x0f\x08\x00\x00\x00"[..]),
    nom::IResult::Done(
      &[][..],
      ast::SwfHeaderSignature {
        compression_method: ast::CompressionMethod::Deflate,
        swf_version: 15u8,
        uncompressed_file_length: 8
      }
    )
    );
  }
}
