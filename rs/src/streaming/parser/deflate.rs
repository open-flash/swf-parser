use crate::stream_buffer::StreamBuffer;
use inflate::InflateStream;
use swf_types::{Header as SwfHeader, SwfSignature, Tag};

use super::{ParseTagsError, SimpleStream};

/// State of the `Deflate` payload parser
pub(crate) struct DeflateStream<B: StreamBuffer> {
  inflater: InflateStream,
  simple: SimpleStream<B>,
}

impl<B: StreamBuffer> DeflateStream<B> {
  pub(crate) fn new(buffer: B, signature: SwfSignature) -> Self {
    let inflater = inflate::InflateStream::from_zlib();
    let simple = SimpleStream::new(B::new(), signature);
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
  pub(crate) fn tags(&mut self) -> Result<Option<Vec<Tag>>, ParseTagsError> {
    self.simple.tags()
  }
}
