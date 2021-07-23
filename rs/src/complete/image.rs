use crate::complete::base::skip;
use nom::number::complete::{be_u16 as parse_be_u16, be_u32 as parse_be_u32};
use nom::IResult as NomResult;

pub struct ImageDimensions {
  pub width: usize,
  pub height: usize,
}

pub const PNG_START: [u8; 8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
pub const GIF_START: [u8; 6] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
pub const JPEG_START: [u8; 2] = [0xff, 0xd8];
pub const ERRONEOUS_JPEG_START: [u8; 6] = [0xff, 0xd9, 0xff, 0xd8, 0xff, 0xd8];

const PNG_IHDR_CHUNK_TYPE: u32 = 0x49_48_44_52;

/// Reads image properties from a byte stream with the content of a PNG image.
///
/// It trusts that the image has a valid PNG signature (first 8 bytes).
///
/// @see https://www.w3.org/TR/PNG/#5Chunk-layout
/// @see https://www.w3.org/TR/PNG/#5ChunkOrdering
/// @see https://www.w3.org/TR/PNG/#11IHDR
pub fn get_png_image_dimensions(input: &[u8]) -> Result<ImageDimensions, ()> {
  // Skip PNG signature (8 bytes) and IHDR (Image Header) chunk size (4 bytes)
  let (input, ()) = skip::<_, _, ()>(12usize)(input).map_err(|_| ())?;
  let (input, chunk_type) = parse_be_u32::<&[u8], ()>(input).map_err(|_| ())?;
  if chunk_type != PNG_IHDR_CHUNK_TYPE {
    // Expected chunk type to be IHDR (Image Header)
    return Err(());
  }
  let (input, width) = parse_be_u32::<&[u8], ()>(input).map_err(|_| ())?;
  let (_, height) = parse_be_u32::<&[u8], ()>(input).map_err(|_| ())?;

  Ok(ImageDimensions {
    width: width as usize,
    height: height as usize,
  })
}

pub fn get_jpeg_image_dimensions(mut input: &[u8]) -> Result<ImageDimensions, ()> {
  loop {
    let (next_input, chunk) = take_next_jpeg_chunk(input).map_err(|_| ())?;
    if chunk.is_some() {
      // Assert progress
      debug_assert!(next_input.len() < input.len());
    }
    input = next_input;
    if let Some(chunk) = chunk {
      if chunk.len() < 9 {
        continue;
      }
      let code: u8 = chunk[1];
      if !is_jpeg_sof(code) {
        continue;
      }
      // At this point we have an SOFn chunk with at least 9 bytes
      let frame_height = u16::from_be_bytes([chunk[5], chunk[6]]);
      let frame_width = u16::from_be_bytes([chunk[7], chunk[8]]);
      // There may be multiple SOF chunks, we return the dimension corresponding
      // to the first one.
      return Ok(ImageDimensions {
        width: usize::from(frame_width),
        height: usize::from(frame_height),
      });
    } else {
      // End of chunks
      return Err(());
    }
  }
}

/// Finds the next jpeg chunk (or marker/segment/sequence)
///
/// JPEG files are organized as a stream of chunks.
/// A chunk starts with a marker: the two-byte sequence `[0xff, marker_code]` where
/// `0x00 < marker_code < 0xff`. (Consecutive `0xff` values represent padding and `[0xff, 0x00]` is
/// an escaped `0x00` value).
/// Garbage is allowed between chunks, so you have to scan the input to find the marker signaling
/// the start of the chunk.
/// There are two types of chunks:
/// - Standalone markers: they consist in only the marker
/// - Marker sequences: the marker is followed by a sequence. The sequence starts with a
/// `sequence_size` field followed by data. The `sequence_size` is a big-endian U16, it includes the
/// `sequence_size` field its and data, but not the sequence marker.
///
/// This functions returns the next JPEG chunk.
/// If a chunk is found, preceding garbage is skipped and the result is `Ok(suffix, Some(chunk))`
/// where `chunk` is the whole chunk (marker and optional sequence) and `suffix` the remaining
/// input.
/// If a chunk is not found, it returns `Ok(&[], None)` (the input is consumed).
/// If an error occurs, it returns `Err`. Errors can occur if a sequence marker is found but there
/// is not enough data to read the sequence.
fn take_next_jpeg_chunk(input: &[u8]) -> NomResult<&[u8], Option<&[u8]>> {
  use nom::bytes::complete::take;
  use nom::combinator::map;

  let mut search: usize = 0;
  while search + 1 < input.len() {
    let cur_byte: u8 = input[search];
    let marker_type: Option<JpegMarkerType> = if cur_byte == 0xff {
      get_jpeg_marker_type(input[search + 1])
    } else {
      None
    };
    match marker_type {
      Some(marker_type) => {
        // Consume the padding bytes.
        // It won't panic because we have `search + 1 < input.len()`
        let input = &input[search..];
        return match marker_type {
          JpegMarkerType::Standalone => map(take(2usize), Some)(input),
          JpegMarkerType::Sequence => {
            let (_, size) = parse_be_u16(input)?;
            map(take(2usize + usize::from(size)), Some)(input)
          }
        };
      }
      None => search += 1,
    }
  }
  // Reached end of input without finding a marker
  Ok((&[], None))
}

#[derive(Debug, Eq, PartialEq)]
enum JpegMarkerType {
  Standalone,
  Sequence,
}

/// Returns the JPEG marker type (standalone or sequence) for `code`.
///
/// If the code does not correspond to a marker type, returns `None`.
fn get_jpeg_marker_type(code: u8) -> Option<JpegMarkerType> {
  match code {
    0x00 => None,                                    // Escaped `0x00`
    0x01 => Some(JpegMarkerType::Standalone),        // TEM (Temporary)
    0xd0..=0xd7 => Some(JpegMarkerType::Standalone), // RSTn (Reset)
    0xd8 => Some(JpegMarkerType::Standalone),        // SOI (Start of image)
    0xd9 => Some(JpegMarkerType::Standalone),        // EOI (End of image)
    0xff => None,                                    // Padding
    _ => Some(JpegMarkerType::Sequence),             // Reserved (non-standalone) or sequence marker
  }
}

/// Checks if the provided code corresponds to a Start of frame (SOFn) JPEG marker
fn is_jpeg_sof(code: u8) -> bool {
  // SOFn: 0b110000xx
  code & 0xfc == 0xc0
}

pub fn get_gif_image_dimensions(input: &[u8]) -> Result<ImageDimensions, ()> {
  // Skip GIF header (6 bytes): signature (3 bytes) and version (3 bytes)
  let (input, ()) = skip::<_, _, ()>(6usize)(input).map_err(|_| ())?;
  let (input, width) = parse_be_u16::<_, ()>(input).map_err(|_| ())?;
  let (_, height) = parse_be_u16::<_, ()>(input).map_err(|_| ())?;

  Ok(ImageDimensions {
    width: width as usize,
    height: height as usize,
  })
}

pub(crate) enum SniffedImageType {
  Jpeg,
  Png,
  Gif,
}

pub(crate) fn sniff_image_type(image_data: &[u8], allow_erroneous_jpeg: bool) -> Result<SniffedImageType, ()> {
  if is_sniffed_jpeg(image_data, allow_erroneous_jpeg) {
    Ok(SniffedImageType::Jpeg)
  } else if is_sniffed_png(image_data) {
    Ok(SniffedImageType::Png)
  } else if is_sniffed_gif(image_data) {
    Ok(SniffedImageType::Gif)
  } else {
    Err(())
  }
}

pub(crate) fn is_sniffed_jpeg(image_data: &[u8], allow_erroneous: bool) -> bool {
  test_image_start(image_data, &JPEG_START) || (allow_erroneous && test_image_start(image_data, &ERRONEOUS_JPEG_START))
}

pub(crate) fn is_sniffed_png(image_data: &[u8]) -> bool {
  test_image_start(image_data, &PNG_START)
}

pub(crate) fn is_sniffed_gif(image_data: &[u8]) -> bool {
  test_image_start(image_data, &GIF_START)
}

fn test_image_start(image_data: &[u8], start_bytes: &[u8]) -> bool {
  image_data.len() >= start_bytes.len() && image_data[..start_bytes.len()] == *start_bytes
}
