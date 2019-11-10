use nom::number::complete::{be_u16 as parse_be_u16, be_u32 as parse_be_u32, le_u32 as parse_le_u32};

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
  let input = &input[12..];
  let (input, chunk_type) = parse_be_u32::<()>(input).unwrap();
  if chunk_type != PNG_IHDR_CHUNK_TYPE {
    panic!("InvalidPngFile");
  }
  let (input, width) = parse_be_u32::<()>(input).unwrap();
  let (_, height) = parse_be_u32::<()>(input).unwrap();

  Ok(ImageDimensions {
    width: width as usize,
    height: height as usize,
  })
}

pub fn get_jpeg_image_dimensions(input: &[u8]) -> Result<ImageDimensions, ()> {
  let mut dimensions: Option<ImageDimensions> = None;

  for chunk in read_jpeg_chunks(input) {
    let code: u8 = chunk[1];
    // SOF: 0b110000xx
    if (code & 0xfc) == 0xc0 && chunk.len() >= 9 {
      let frame_height: u16 = ((chunk[5] as u16) << 8) + (chunk[6] as u16);
      let frame_width: u16 = ((chunk[7] as u16) << 8) + (chunk[8] as u16);
      dimensions = match dimensions {
        None => Some(ImageDimensions {
          width: frame_width as usize,
          height: frame_height as usize,
        }),
        d => d,
      };
    }
  }

  match dimensions {
    Some(d) => Ok(d),
    None => Err(()),
  }
}

fn read_jpeg_chunks(input: &[u8]) -> Vec<&[u8]> {
  let mut next_chunk_start: Option<&[u8]> = find_next_chunk(input);

  let mut result: Vec<&[u8]> = Vec::new();

  while let Some(chunk) = next_chunk_start {
    let code: u8 = chunk[1];
    let mut size: usize = 2;
    if (code >= 0xc0 && code <= 0xc7)
      || (code >= 0xc9 && code <= 0xcf)
      || (code >= 0xda && code <= 0xef)
      || code == 0xfe
    {
      size += ((chunk[2] as usize) << 8) + (chunk[3] as usize);
    }
    next_chunk_start = find_next_chunk(&chunk[size..]);
    match &next_chunk_start {
      Some(next) => result.push(&chunk[..(chunk.len() - next.len())]),
      None => result.push(chunk),
    }
  }

  result
}

fn find_next_chunk(input: &[u8]) -> Option<&[u8]> {
  let mut search: usize = 0;
  while search + 1 < input.len() {
    let cur_byte: u8 = input[search];
    let next_byte: u8 = input[search + 1];
    if cur_byte == 0xff && (next_byte != 0x00 && next_byte != 0xff) {
      return Some(&input[search..]);
    } else {
      search += 1;
    }
  }
  None
}

pub fn get_gif_image_dimensions(input: &[u8]) -> Result<ImageDimensions, ()> {
  // Skip GIF header: "GIF89a" in ASCII for SWF
  let input = &input[6..];
  let (input, chunk_type) = parse_le_u32::<()>(input).unwrap();
  if chunk_type != PNG_IHDR_CHUNK_TYPE {
    panic!("InvalidPngFile");
  }
  let (input, width) = parse_be_u16::<()>(input).unwrap();
  let (_, height) = parse_be_u16::<()>(input).unwrap();

  Ok(ImageDimensions {
    width: width as usize,
    height: height as usize,
  })
}

pub fn test_image_start(image_data: &[u8], start_bytes: &[u8]) -> bool {
  image_data.len() >= start_bytes.len() && image_data[..start_bytes.len()] == *start_bytes
}
