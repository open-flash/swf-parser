pub struct ImageDimensions {
  pub width: usize,
  pub height: usize,
}

pub const PNG_START: [u8; 8] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
pub const GIF_START: [u8; 6] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
pub const JPEG_START: [u8; 2] = [0xff, 0xd8];
pub const ERRONEOUS_JPEG_START: [u8; 6] = [0xff, 0xd9, 0xff, 0xd8, 0xff, 0xd8];

pub fn get_jpeg_image_dimensions(input: &[u8]) -> Result<ImageDimensions, ()> {
  let mut dimensions: Option<ImageDimensions> = None;

  for chunk in read_jpeg_chunks(input) {
    let code: u8 = chunk[1];
    // SOF: 0b110000xx
    if (code & 0xfc) == 0xc0 && chunk.len() >= 9 {
      let frame_height: u16 = ((chunk[5] as u16) << 8) + (chunk[6] as u16);
      let frame_width: u16 = ((chunk[7] as u16) << 8) + (chunk[8] as u16);
      dimensions = match dimensions {
        None => Some(ImageDimensions { width: frame_width as usize, height: frame_height as usize }),
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
      || code == 0xfe {
      size += ((chunk[2] as usize) << 8) + (chunk[3] as usize);
    }
    next_chunk_start = find_next_chunk(&input[size..]);
    match &next_chunk_start {
      Some(next) => result.push(&input[..(chunk.len() - next.len())]),
      None => result.push(input)
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

pub fn test_image_start(image_data: &[u8], start_bytes: &[u8]) -> bool {
  return image_data[..start_bytes.len()] == *start_bytes;
}
