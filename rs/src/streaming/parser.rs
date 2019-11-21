use crate::stream_buffer::{FlatBuffer, StreamBuffer};
use crate::streaming::movie::{parse_header, parse_swf_signature};
use crate::streaming::tag::parse_tag;
use inflate::InflateStream;
use swf_types::CompressionMethod;
use swf_types::{Header as SwfHeader, SwfSignature, Tag};

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
  Deflate(DeflateStream<FlatBuffer>),
  /// Finished parsing the signature, started parsing the `LZMA`-compressed
  /// payload
  Lzma(LzmaStream<FlatBuffer>),
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
  pub fn header(self, bytes: &[u8]) -> Result<(SwfHeader, TagParser), Self> {
    match self.0 {
      InnerHeaderParser::Signature(mut buffer) => {
        buffer.extend_from_slice(bytes);
        let (input, signature) = match parse_swf_signature(&buffer) {
          Ok(ok) => ok,
          Err(nom::Err::Incomplete(_)) => return Err(Self(InnerHeaderParser::Signature(buffer))),
          Err(nom::Err::Error(_)) | Err(nom::Err::Failure(_)) => {
            return Err(Self(InnerHeaderParser::Signature(buffer)));
          }
        };
        let buffer: FlatBuffer = FlatBuffer::new();

        match signature.compression_method {
          CompressionMethod::None => {
            HeaderParser::simple_header(SimpleStream::new(buffer, signature.swf_version), input)
          }
          CompressionMethod::Lzma => HeaderParser::lzma_header(LzmaStream::new(buffer, &signature), input),
          CompressionMethod::Deflate => HeaderParser::deflate_header(DeflateStream::new(buffer, &signature), input),
        }
      }
      InnerHeaderParser::Simple(stream) => HeaderParser::simple_header(stream, bytes),
      InnerHeaderParser::Lzma(stream) => HeaderParser::lzma_header(stream, bytes),
      InnerHeaderParser::Deflate(stream) => HeaderParser::deflate_header(stream, bytes),
    }
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
  fn lzma_header(mut stream: LzmaStream<FlatBuffer>, bytes: &[u8]) -> Result<(SwfHeader, TagParser), Self> {
    stream.write(bytes);
    match stream.header() {
      Ok((header, stream)) => Ok((header, TagParser(InnerTagParser::Lzma(stream)))),
      Err(stream) => Err(Self(InnerHeaderParser::Lzma(stream))),
    }
  }

  /// Finish parsing the header from a deflate-compressed payload.
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
  Deflate(DeflateStream<FlatBuffer>),
  /// Parse tags from a LZMA-compressed stream
  Lzma(LzmaStream<FlatBuffer>),
}

impl TagParser {
  /// Appends the provided bytes to the internal buffer and tries to parse most of the tags.
  /// Return `None` if it has finished parsing the movie.
  ///
  /// TODO: `impl Iterator<Item=Tag>` instead of `Vec<Tag>`
  pub fn tags(&mut self, bytes: &[u8]) -> Result<Option<Vec<Tag>>, ()> {
    match &mut self.0 {
      InnerTagParser::Simple(ref mut stream) => {
        stream.write(bytes);
        stream.tags()
      }
      InnerTagParser::Deflate(ref mut stream) => {
        stream.write(bytes);
        stream.tags()
      }
      InnerTagParser::Lzma(ref mut stream) => {
        stream.write(bytes);
        stream.tags()
      }
    }
  }
}

/// State of the uncompressed payload parser
struct SimpleStream<B: StreamBuffer> {
  buffer: B,
  swf_version: u8,
  is_end: bool,
}

impl<B: StreamBuffer> SimpleStream<B> {
  pub(crate) fn new(buffer: B, swf_version: u8) -> Self {
    Self {
      buffer,
      swf_version,
      is_end: false,
    }
  }

  /// Appends data to the internal buffer.
  pub(crate) fn write(&mut self, bytes: &[u8]) {
    self.buffer.write(bytes);
  }

  /// Finishes parsing the SWF header from the internal buffer.
  pub(crate) fn header(mut self) -> Result<(SwfHeader, Self), Self> {
    let buffer: &[u8] = self.buffer.get();
    let (remaining, header) = match parse_header(buffer, self.swf_version) {
      Ok(ok) => ok,
      Err(nom::Err::Incomplete(_)) => return Err(self),
      Err(nom::Err::Error(_)) | Err(nom::Err::Failure(_)) => return Err(self),
    };
    let parsed_len: usize = buffer.len() - remaining.len();

    self.buffer.clear(parsed_len);

    Ok((header, self))
  }

  /// Parses the available tags from the internal buffer.
  ///
  /// Returns `Ok(None)` if parsing is complete (there are no more tags).
  /// Returns `Ok(Some(Vec<Tag>))` when some tags are available. `Vec` is non-empty.
  /// Returns `Err(())` when there's not enough data or an error occurs.
  pub(crate) fn tags(&mut self) -> Result<Option<Vec<Tag>>, ()> {
    if self.is_end {
      return Ok(None);
    }

    let buffer: &[u8] = self.buffer.get();

    let mut input: &[u8] = buffer;
    let mut tags: Vec<Tag> = Vec::new();
    let is_end: bool = loop {
      match parse_tag(input, self.swf_version) {
        Ok((_, None)) => {
          input = &[][..];
          break true;
        }
        Ok((next_input, Some(tag))) => {
          tags.push(tag);
          input = next_input;
        }
        Err(_) => {
          break false;
        }
      };
    };

    if is_end {
      self.is_end = true;
    }

    let parsed_len: usize = buffer.len() - input.len();
    self.buffer.clear(parsed_len);

    if tags.is_empty() {
      if is_end {
        Ok(None)
      } else {
        Err(())
      }
    } else {
      Ok(Some(tags))
    }
  }
}

/// State of the `Deflate` payload parser
struct DeflateStream<B: StreamBuffer> {
  inflater: InflateStream,
  simple: SimpleStream<B>,
}

impl<B: StreamBuffer> DeflateStream<B> {
  pub(crate) fn new(buffer: B, signature: &SwfSignature) -> Self {
    let inflater = inflate::InflateStream::from_zlib();
    let simple = SimpleStream::new(B::new(), signature.swf_version);
    let mut deflate_stream = Self { inflater, simple };
    deflate_stream.write(buffer.get());
    deflate_stream
  }

  /// Appends data to the internal buffer.
  pub(crate) fn write(&mut self, mut bytes: &[u8]) {
    while !bytes.is_empty() {
      match self.inflater.update(bytes) {
        Ok((read_count, chunk)) => {
          bytes = &bytes[read_count..];
          self.simple.write(chunk);
        }
        Err(e) => panic!("Failed to write Deflate payload {}", e),
      }
    }
  }

  /// Finishes parsing the SWF header from the internal buffer.
  pub(crate) fn header(self) -> Result<(SwfHeader, Self), Self> {
    match self.simple.header() {
      Ok((header, simple)) => Ok((
        header,
        Self {
          inflater: self.inflater,
          simple,
        },
      )),
      Err(simple) => Err(Self {
        inflater: self.inflater,
        simple,
      }),
    }
  }

  /// Parses the available tags from the internal buffer.
  ///
  /// Returns `Ok(None)` if parsing is complete (there are no more tags).
  /// Returns `Ok(Some(Vec<Tag>))` when some tags are available. `Vec` is non-empty.
  /// Returns `Err(())` when there's not enough data or an error occurs.
  pub(crate) fn tags(&mut self) -> Result<Option<Vec<Tag>>, ()> {
    self.simple.tags()
  }
}

// TODO: Send PR to lzma-rs to support LZMA stream parsing
struct LzmaParser {}

impl LzmaParser {
  pub fn new() -> Self {
    unimplemented!();
  }
}

/// State of the `Deflate` payload parser
struct LzmaStream<B: StreamBuffer> {
  #[allow(dead_code)]
  lzma_parser: LzmaParser,
  simple: SimpleStream<B>,
}

impl<B: StreamBuffer> LzmaStream<B> {
  pub(crate) fn new(buffer: B, signature: &SwfSignature) -> Self {
    let lzma_parser = LzmaParser::new();
    let simple = SimpleStream::new(B::new(), signature.swf_version);
    let mut stream = Self { lzma_parser, simple };
    stream.write(buffer.get());
    stream
  }

  pub(crate) fn write(&mut self, mut _bytes: &[u8]) {
    unimplemented!()
  }

  pub(crate) fn header(self) -> Result<(SwfHeader, Self), Self> {
    unimplemented!()
  }

  pub(crate) fn tags(&mut self) -> Result<Option<Vec<Tag>>, ()> {
    self.simple.tags()
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use swf_types::Movie;

  #[test]
  fn test_stream_parse_blank() {
    let movie_ast_bytes: &[u8] = include_bytes!("../../../tests/movies/blank/ast.json");
    let expected: Movie = serde_json_v8::from_slice::<Movie>(movie_ast_bytes).expect("Failed to read AST");

    let movie_bytes: &[u8] = include_bytes!("../../../tests/movies/blank/main.swf");
    let mut movie_bytes = movie_bytes.iter().copied().enumerate();

    let mut parser = HeaderParser::new();
    let mut header_output: Option<(SwfHeader, TagParser)> = None;
    while let Some((index, byte)) = movie_bytes.next() {
      match parser.header(&[byte]) {
        Ok((header, tag_parser)) => {
          assert_eq!(index, 20);
          header_output = Some((header, tag_parser));
          break;
        }
        Err(next_parser) => parser = next_parser,
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
