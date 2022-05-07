use std::fmt;

use crate::complete::parse_tag;
use crate::streaming::movie::parse_swf_signature;
use crate::streaming::decompress;
use ast::CompressionMethod;
use nom::IResult as NomResult;
use swf_types as ast;

/// Represents the possible parse errors when parsing an SWF file.
///
/// Fatal errors can only occur at the beginning of the parsing. Once the header
/// is parsed, the tags are always parsed successfully. Invalid tags produce
/// `Raw` tags but don't prevent the parser from completing: the parser is
/// resilient to invalid (or unknown) tags.
#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SwfParseError {
  /// Indicates an invalid SWF signature.
  ///
  /// The SWF signature corresponds to the first 8 bytes of the movie.
  /// This error occurs either if there is not enough data to even parse
  /// the signature or if the compression method is invalid.
  InvalidSignature,

  /// Indicates that the compression method used by the payload isn't supported.
  ///
  /// This can only happen when the corresponding Cargo feature is disabled.
  UnsupportedCompression(CompressionMethod),

  /// Indicates a failure to decompress the payload.
  ///
  /// The payload represents all the data following the SWF signature.
  /// If the SWF file uses a compressed payload (`Deflate` or `Lzma`), this
  /// error is emitted when the decompression fails for any reason.
  InvalidPayload,

  /// Indicates an invalid movie header.
  ///
  /// The movie header corresponds to the first few bytes of the payload.
  /// This error occurs if there is not enough data to parse the header.
  InvalidHeader,
}

impl std::error::Error for SwfParseError {}

impl fmt::Display for SwfParseError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      SwfParseError::InvalidSignature => f.write_str("invalid SWF signature"),
      SwfParseError::UnsupportedCompression(comp) => {
        f.write_str("unsupported SWF compression: ")?;
        fmt::Debug::fmt(comp, f)
      }
      SwfParseError::InvalidPayload => f.write_str("invalid SWF payload"),
      SwfParseError::InvalidHeader => f.write_str("invalid SWF header"),
    }
  }
}

/// Parses a completely loaded SWF file.
///
/// See [[SwfParseError]] for details on the possible errors.
///
/// This function never panics.
pub fn parse_swf(input: &[u8]) -> Result<ast::Movie, SwfParseError> {
  let (input, signature) = match parse_swf_signature(input) {
    Ok(ok) => ok,
    Err(_) => return Err(SwfParseError::InvalidSignature),
  };

  let result = match signature.compression_method {
    CompressionMethod::None => decompress::decompress_none(input),
    #[cfg(feature="deflate")]
    CompressionMethod::Deflate => decompress::decompress_zlib(input),
    #[cfg(feature="lzma")]
    CompressionMethod::Lzma => decompress::decompress_lzma(input),
    #[allow(unreachable_patterns)]
    method => return Err(SwfParseError::UnsupportedCompression(method)),
  };

  let (_input, payload) = result.map_err(|_| SwfParseError::InvalidPayload)?;

  // TODO: should we check that the input was fully consumed?
  // TODO: check decompressed payload length against signature?

  match parse_movie(&payload, signature.swf_version) {
    Ok((_, movie)) => Ok(movie),
    Err(_) => Err(SwfParseError::InvalidHeader),
  }
}

/// Parses a completely loaded movie.
///
/// The movie is the uncompressed payload of the SWF.
fn parse_movie(input: &[u8], swf_version: u8) -> NomResult<&[u8], ast::Movie> {
  let (input, header) = parse_header(input, swf_version)?;
  let tags = parse_tag_block_string(input, swf_version);

  Ok((&[][..], ast::Movie { header, tags }))
}

/// Parses the movie header from a completely loaded input.
fn parse_header(input: &[u8], swf_version: u8) -> NomResult<&[u8], ast::Header> {
  match crate::streaming::movie::parse_header(input, swf_version) {
    Ok(ok) => Ok(ok),
    Err(nom::Err::Incomplete(_)) => Err(nom::Err::Error(nom::error::Error::new(input, nom::error::ErrorKind::Complete))),
    Err(e) => Err(e),
  }
}

/// Parses the string of tags from a completely loaded input.
pub(crate) fn parse_tag_block_string(mut input: &[u8], swf_version: u8) -> Vec<ast::Tag> {
  let mut tags: Vec<ast::Tag> = Vec::new();
  loop {
    input = match parse_tag(input, swf_version) {
      (input, Some(tag)) => {
        tags.push(tag);
        input
      }
      (_, None) => return tags,
    }
  }
}
