use std::fmt;

use crate::stream_buffer::{FlatBuffer, StreamBuffer};
use crate::streaming::movie::parse_swf_signature;
use swf_types::CompressionMethod;
use swf_types::{Header as SwfHeader, Tag};

mod simple;
#[cfg(feature="deflate")]
mod deflate;
#[cfg(feature="lzma")]
mod lzma;

use simple::SimpleStream;
#[cfg(feature="deflate")]
use deflate::DeflateStream;
#[cfg(feature="lzma")]
use lzma::LzmaStream;

/// Streaming parser currently parsing the SWF header
///
/// This struct holds the internal state of the parser, including an internal
/// buffer with the unparsed input provided so far.
///
/// This struct is logically an enum where each variant represents the state
/// of the parser. See `InnerHeaderParser` for details on these states.
pub struct HeaderParser(InnerHeaderParser);

/// Enum holding the state of `HeaderParser`
enum InnerHeaderParser {
  /// Still parsing the SWF signature (8 first bytes)
  Signature(Vec<u8>),
  /// Finished parsing the signature, started parsing the uncompressed payload
  Simple(SimpleStream<FlatBuffer>),
  /// Finished parsing the signature, started parsing the `Deflate`-compressed
  /// payload
  #[cfg(feature="deflate")]
  Deflate(DeflateStream<FlatBuffer>),
  /// Finished parsing the signature, started parsing the `LZMA`-compressed
  /// payload
  #[cfg(feature="lzma")]
  Lzma(LzmaStream<FlatBuffer>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum HeaderParserError {
  /// Failed to parse the header due to a disabled feature in `swf-parser`
  MissingFeature(&'static str),
  /// Other error (todo: replace this variant to provide more details)
  Other,
}

impl std::error::Error for HeaderParserError {}

impl fmt::Display for HeaderParserError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
        HeaderParserError::MissingFeature(feat) => write!(
          f,
          "unsupported compression type in SWF header: compile `swf-parser` with the `{}` feature",
          feat,
        ),
        HeaderParserError::Other => f.write_str("couldn't parse SWF header"),
    }
  }
}

impl HeaderParser {
  /// Creates a new empty streaming parser.
  pub fn new() -> Self {
    Self(InnerHeaderParser::Signature(Vec::new()))
  }

  /// Appends `bytes` to the internal buffer and tries to parse the SWF header.
  ///
  /// If there is not enough data to parse the SWF header, it returns an error containing a
  /// `HeaderParser` to continue parsing when more data is available.
  /// If the data is unreadable (e.g. due to an invalid compression) it returns a failure (TODO).
  /// If there is enough data to parse the header, it returns an `Ok` result with the parsed header
  /// and a `TagParser` to start parsing the SWF tags.
  ///
  /// Note: this method consumes `self` to prevent from trying to parse the SWF
  /// header multiple times.
  pub fn header(self, bytes: &[u8]) -> Result<(SwfHeader, TagParser), (Self, HeaderParserError)> {
    match self.0 {
      InnerHeaderParser::Signature(mut buffer) => {
        let (input, parser) = Self::parser_from_signature(&mut buffer, bytes)?;
        parser.header(input)
      }
      InnerHeaderParser::Simple(stream) => HeaderParser::simple_header(stream, bytes).map_err(|this| (this, HeaderParserError::Other)),
      #[cfg(feature="lzma")]
      InnerHeaderParser::Lzma(stream) => HeaderParser::lzma_header(stream, bytes).map_err(|this| (this, HeaderParserError::Other)),
      #[cfg(feature="deflate")]
      InnerHeaderParser::Deflate(stream) => HeaderParser::deflate_header(stream, bytes).map_err(|this| (this, HeaderParserError::Other)),
    }
  }

  fn parser_from_signature<'a>(buffer: &'a mut Vec<u8>, bytes: &[u8]) -> Result<(&'a [u8], Self), (Self, HeaderParserError)> {
    buffer.extend_from_slice(bytes);

    // Weird dance to avoid borrowck issues.
    let consumed_and_sig = parse_swf_signature(&*buffer).map(|(remaining, signature)| {
      (buffer.len() - remaining.len(), signature)
    });
    let (input, signature) = match consumed_and_sig {
      Ok((off, signature)) => (&buffer[off..], signature),
      Err(_) => return Err((Self(InnerHeaderParser::Signature(std::mem::take(buffer))), HeaderParserError::Other)),
    };

    let buffer: FlatBuffer = FlatBuffer::new();
    let parser = match signature.compression_method {
      CompressionMethod::None => InnerHeaderParser::Simple(SimpleStream::new(buffer, signature)),
      #[cfg(feature="lzma")]
      CompressionMethod::Lzma => InnerHeaderParser::Lzma(LzmaStream::new(buffer, signature)),
      #[cfg(not(feature="lzma"))]
      CompressionMethod::Lzma => return Err((Self(InnerHeaderParser::Signature(std::mem::take(buffer))), HeaderParserError::MissingFeature("lzma"))),
      #[cfg(feature="deflate")]
      CompressionMethod::Deflate => InnerHeaderParser::Deflate(DeflateStream::new(buffer, signature)),
      #[cfg(not(feature="deflate"))]
      CompressionMethod::Deflate => return Err((Self(InnerHeaderParser::Signature(std::mem::take(buffer))), HeaderParserError::MissingFeature("deflate"))),
    };
    Ok((input, Self(parser)))
  }

  /// Finish parsing the header from an uncompressed payload.
  fn simple_header(mut stream: SimpleStream<FlatBuffer>, bytes: &[u8]) -> Result<(SwfHeader, TagParser), Self> {
    stream.write(bytes);
    match stream.header() {
      Ok((header, stream)) => Ok((header, TagParser(InnerTagParser::Simple(stream)))),
      Err(stream) => Err(Self(InnerHeaderParser::Simple(stream))),
    }
  }

  /// Finish parsing the header from a LZMA-compressed payload.
  #[cfg(feature="lzma")]
  fn lzma_header(mut stream: LzmaStream<FlatBuffer>, bytes: &[u8]) -> Result<(SwfHeader, TagParser), Self> {
    stream.write(bytes);
    match stream.header() {
      Ok((header, stream)) => Ok((header, TagParser(InnerTagParser::Lzma(stream)))),
      Err(stream) => Err(Self(InnerHeaderParser::Lzma(stream))),
    }
  }

  /// Finish parsing the header from a deflate-compressed payload.
  #[cfg(feature="deflate")]
  fn deflate_header(mut stream: DeflateStream<FlatBuffer>, bytes: &[u8]) -> Result<(SwfHeader, TagParser), Self> {
    stream.write(bytes);
    match stream.header() {
      Ok((header, stream)) => Ok((header, TagParser(InnerTagParser::Deflate(stream)))),
      Err(stream) => Err(Self(InnerHeaderParser::Deflate(stream))),
    }
  }
}

impl Default for HeaderParser {
  fn default() -> Self {
    Self::new()
  }
}

/// Streaming parser currently parsing the SWF tags.
///
/// The recommended way to get a `TagParser` instance is to first parse a header using
/// an `SwfHeaderParser`.
///
/// This struct holds the internal state of the parser, including an internal
/// buffer with the unparsed input provided so far.
///
/// This struct is logically an enum where each variant represents the state
/// of the parser. See `InnerTagParser` for details on these states.
pub struct TagParser(InnerTagParser);

enum InnerTagParser {
  /// Parse tags from an uncompressed stream
  Simple(SimpleStream<FlatBuffer>),
  /// Parse tags from a deflate-compressed stream
  #[cfg(feature="deflate")]
  Deflate(DeflateStream<FlatBuffer>),
  /// Parse tags from a LZMA-compressed stream
#[cfg(feature="lzma")]
  Lzma(LzmaStream<FlatBuffer>),
}

// TODO: Implement proper error type
#[derive(Debug)]
pub struct ParseTagsError;

impl std::error::Error for ParseTagsError {}

impl fmt::Display for ParseTagsError {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.write_str("failed to parse SWF tag")
  }
}

impl TagParser {
  /// Appends the provided bytes to the internal buffer and tries to parse most of the tags.
  /// Return `None` if it has finished parsing the movie.
  ///
  /// TODO: `impl Iterator<Item=Tag>` instead of `Vec<Tag>`
  pub fn tags(&mut self, bytes: &[u8]) -> Result<Option<Vec<Tag>>, ParseTagsError> {
    match &mut self.0 {
      InnerTagParser::Simple(ref mut stream) => {
        stream.write(bytes);
        stream.tags()
      }
      #[cfg(feature="deflate")]
      InnerTagParser::Deflate(ref mut stream) => {
        stream.write(bytes);
        stream.tags()
      }
      #[cfg(feature="lzma")]
      InnerTagParser::Lzma(ref mut stream) => {
        stream.write(bytes);
        stream.tags()
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use swf_types::Movie;

  #[test]
  fn test_stream_parse_blank() {
    let movie_ast_bytes: &[u8] = include_bytes!("../../../../tests/movies/blank/ast.json");
    let expected: Movie = serde_json_v8::from_slice::<Movie>(movie_ast_bytes).expect("Failed to read AST");

    let movie_bytes: &[u8] = include_bytes!("../../../../tests/movies/blank/main.swf");
    let mut movie_bytes = movie_bytes.iter().copied().enumerate();

    let mut parser = HeaderParser::new();
    let mut header_output: Option<(SwfHeader, TagParser)> = None;
    for (index, byte) in movie_bytes.by_ref() {
      match parser.header(&[byte]) {
        Ok((header, tag_parser)) => {
          assert_eq!(index, 20);
          header_output = Some((header, tag_parser));
          break;
        }
        Err((next_parser, HeaderParserError::Other)) => parser = next_parser,
        Err((_, e)) => panic!("{e:?}"),
      }
    }
    assert!(header_output.is_some());
    let (header, mut parser) = header_output.unwrap();
    let mut tags: Vec<Tag> = Vec::new();
    for (index, byte) in movie_bytes {
      match parser.tags(&[byte]) {
        Ok(Some(new_tags)) => tags.extend_from_slice(&new_tags),
        Ok(None) => {
          assert_eq!(index, 52);
          break;
        }
        Err(_) => {}
      }
    }
    let actual: Movie = Movie { header, tags };
    assert_eq!(actual, expected);
  }
}
