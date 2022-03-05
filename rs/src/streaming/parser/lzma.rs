use crate::stream_buffer::StreamBuffer;
use swf_types::{Header as SwfHeader, SwfSignature, Tag};

use super::{ParseTagsError, SimpleStream};

// TODO: Send PR to lzma-rs to support LZMA stream parsing
struct LzmaParser {}

impl LzmaParser {
  pub fn new() -> Self {
    unimplemented!("LZMA decompression is unsupported in streaming mode");
  }
}

/// State of the `Lzma` payload parser
pub(crate) struct LzmaStream<B: StreamBuffer> {
  #[allow(dead_code)]
  lzma_parser: LzmaParser,
  simple: SimpleStream<B>,
}

impl<B: StreamBuffer> LzmaStream<B> {
  pub(crate) fn new(buffer: B, signature: SwfSignature) -> Self {
    let lzma_parser = LzmaParser::new();
    let simple = SimpleStream::new(B::new(), signature);
    let mut stream = Self { lzma_parser, simple };
    stream.write(buffer.get());
    stream
  }

  pub(crate) fn write(&mut self, mut _bytes: &[u8]) {
    unreachable!()
  }

  pub(crate) fn header(self) -> Result<(SwfHeader, Self), Self> {
    unreachable!()
  }

  pub(crate) fn tags(&mut self) -> Result<Option<Vec<Tag>>, ParseTagsError> {
    self.simple.tags()
  }
}
