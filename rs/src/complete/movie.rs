use swf_tree as ast;
use crate::streaming::movie::{parse_swf_signature, parse_movie_payload};

#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SwfParseError {
  InvalidSignature,
  InvalidPayload,
  InvalidMovie,
}

/// Parse a completely loaded SWF file
pub fn parse_swf(input: &[u8]) -> Result<ast::Movie, SwfParseError> {
  let (input, signature) = match parse_swf_signature(input) {
    Ok(ok) => ok,
    Err(_) => return Err(SwfParseError::InvalidSignature),
  };

  let mut payload_memory: Vec<u8>;

  let payload: &[u8] = match signature.compression_method {
    ast::CompressionMethod::None => input,
    ast::CompressionMethod::Deflate => {
      use ::std::io::Write;
      let mut decoder = ::inflate::InflateWriter::from_zlib(Vec::new());
      match decoder.write(input) {
        Ok(_) => (),
        Err(_) => return Err(SwfParseError::InvalidPayload),
      }
      payload_memory = match decoder.finish() {
        Ok(uncompressed) => uncompressed,
        Err(_) => return Err(SwfParseError::InvalidPayload),
      };
      &payload_memory
    },
    ast::CompressionMethod::Lzma => {
      let mut payload_reader = std::io::BufReader::new(input);
      payload_memory = Vec::new();
      match lzma_rs::lzma_decompress(&mut payload_reader, &mut payload_memory) {
        Ok(_) => (),
        Err(_) => return Err(SwfParseError::InvalidPayload),
      }
      &payload_memory
    }
  };

  let (_, movie) = match parse_movie_payload(payload, signature.swf_version) {
    Ok(ok) => ok,
    Err(_) => return Err(SwfParseError::InvalidMovie),
  };

  Ok(movie)
}
