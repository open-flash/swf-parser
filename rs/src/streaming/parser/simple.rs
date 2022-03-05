use crate::stream_buffer::StreamBuffer;
use crate::streaming::movie::parse_header;
use crate::streaming::tag::parse_tag;
use swf_types::{Header as SwfHeader, Tag, SwfSignature};

use super::ParseTagsError;

/// State of the uncompressed payload parser
pub(crate) struct SimpleStream<B: StreamBuffer> {
  buffer: B,
  swf_version: u8,
  is_end: bool,
}

impl<B: StreamBuffer> SimpleStream<B> {
  pub(crate) fn new(buffer: B, signature: SwfSignature) -> Self {
    // TODO: track uncompressed length of signature?
    Self {
      buffer,
      swf_version: signature.swf_version,
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
  pub(crate) fn tags(&mut self) -> Result<Option<Vec<Tag>>, ParseTagsError> {
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
        Err(ParseTagsError)
      }
    } else {
      Ok(Some(tags))
    }
  }
}
