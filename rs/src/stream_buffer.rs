/// Trait representing the buffer backing a streaming parser.
///
/// This trait provides a way to keep only the unparsed input in memory.
pub trait StreamBuffer {
  fn new() -> Self;

  /// Add unparsed data at the end of the buffer.
  fn write(&mut self, unparsed_bytes: &[u8]) -> ();

  /// Get the unparsed data.
  fn get(&self) -> &[u8];

  /// Mark the provided count of bytes as _parsed_.
  fn clear(&mut self, parsed_size: usize) -> ();
}

/// Stream buffer backed a `Vec<u8>`.
pub struct FlatBuffer {
  parsed: usize,
  inner: Vec<u8>,
}

impl FlatBuffer {}

impl StreamBuffer for FlatBuffer {
  fn new() -> Self {
    Self {
      parsed: 0,
      inner: Vec::new(),
    }
  }

  fn write(&mut self, unparsed_bytes: &[u8]) {
    self.inner.extend_from_slice(unparsed_bytes)
  }

  fn get(&self) -> &[u8] {
    &self.inner[self.parsed..]
  }

  fn clear(&mut self, parsed_size: usize) {
    self.parsed += parsed_size;
  }
}

// TODO: Ring buffer backed by a `SliceDeque`?
