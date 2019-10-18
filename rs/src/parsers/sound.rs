use nom::number::streaming::{le_u16 as parse_le_u16, le_u32 as parse_le_u32, le_u8 as parse_u8};
use nom::IResult as NomResult;
use swf_tree as ast;

pub fn sound_rate_from_id(sound_rate_id: u8) -> ast::SoundRate {
  match sound_rate_id {
    0 => ast::SoundRate::SoundRate5500,
    1 => ast::SoundRate::SoundRate11000,
    2 => ast::SoundRate::SoundRate22000,
    3 => ast::SoundRate::SoundRate44000,
    _ => panic!("Unexpected sound rate id"),
  }
}

pub fn audio_coding_format_from_id(audio_coding_format_id: u8) -> ast::AudioCodingFormat {
  match audio_coding_format_id {
    0 => ast::AudioCodingFormat::UncompressedNativeEndian,
    1 => ast::AudioCodingFormat::Adpcm,
    2 => ast::AudioCodingFormat::Mp3,
    3 => ast::AudioCodingFormat::UncompressedLittleEndian,
    4 => ast::AudioCodingFormat::Nellymoser16,
    5 => ast::AudioCodingFormat::Nellymoser8,
    6 => ast::AudioCodingFormat::Nellymoser,
    11 => ast::AudioCodingFormat::Speex,
    _ => panic!("Unexpected audio coding format id"),
  }
}

// TODO: Implement `Copy` on `AudioCodingFormat` and pass it by value
pub fn is_uncompressed_audio_coding_format(format: &ast::AudioCodingFormat) -> bool {
  match format {
    ast::AudioCodingFormat::UncompressedNativeEndian => true,
    ast::AudioCodingFormat::UncompressedLittleEndian => true,
    _ => false,
  }
}

pub fn parse_sound_info(input: &[u8]) -> NomResult<&[u8], ast::SoundInfo> {
  use nom::combinator::cond;
  use nom::multi::count;

  let (input, flags) = parse_u8(input)?;
  let has_in_point = (flags & (1 << 0)) != 0;
  let has_out_point = (flags & (1 << 1)) != 0;
  let has_loops = (flags & (1 << 2)) != 0;
  let has_envelope = (flags & (1 << 3)) != 0;
  let sync_no_multiple = (flags & (1 << 4)) != 0;
  let sync_stop = (flags & (1 << 5)) != 0;
  // Bits [6, 7] are reserved
  let (input, in_point) = cond(has_in_point, parse_le_u32)(input)?;
  let (input, out_point) = cond(has_out_point, parse_le_u32)(input)?;
  let (input, loop_count) = cond(has_loops, parse_le_u16)(input)?;
  let (input, envelope_records) = if has_envelope {
    let (input, record_count) = parse_u8(input)?;
    let (input, envelope_records) = count(parse_sound_envelope, usize::from(record_count))(input)?;
    (input, Some(envelope_records))
  } else {
    (input, None)
  };

  Ok((
    input,
    ast::SoundInfo {
      sync_stop,
      sync_no_multiple,
      in_point,
      out_point,
      loop_count,
      envelope_records,
    },
  ))
}

pub fn parse_sound_envelope(input: &[u8]) -> NomResult<&[u8], ast::SoundEnvelope> {
  let (input, pos44) = parse_le_u32(input)?;
  let (input, left_level) = parse_le_u16(input)?;
  let (input, right_level) = parse_le_u16(input)?;
  Ok((
    input,
    ast::SoundEnvelope {
      pos44,
      left_level,
      right_level,
    },
  ))
}
