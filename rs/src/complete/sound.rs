use nom::number::complete::{le_u16 as parse_le_u16, le_u32 as parse_le_u32, le_u8 as parse_u8};
use nom::IResult as NomResult;
use swf_tree as ast;

pub fn sound_rate_from_code(sound_rate_code: u8) -> Result<ast::SoundRate, ()> {
  match sound_rate_code {
    0 => Ok(ast::SoundRate::SoundRate5500),
    1 => Ok(ast::SoundRate::SoundRate11000),
    2 => Ok(ast::SoundRate::SoundRate22000),
    3 => Ok(ast::SoundRate::SoundRate44000),
    _ => Err(()),
  }
}

pub fn audio_coding_format_from_code(audio_codec_code: u8) -> Result<ast::AudioCodingFormat, ()> {
  match audio_codec_code {
    0 => Ok(ast::AudioCodingFormat::UncompressedNativeEndian),
    1 => Ok(ast::AudioCodingFormat::Adpcm),
    2 => Ok(ast::AudioCodingFormat::Mp3),
    3 => Ok(ast::AudioCodingFormat::UncompressedLittleEndian),
    4 => Ok(ast::AudioCodingFormat::Nellymoser16),
    5 => Ok(ast::AudioCodingFormat::Nellymoser8),
    6 => Ok(ast::AudioCodingFormat::Nellymoser),
    11 => Ok(ast::AudioCodingFormat::Speex),
    _ => Err(()),
  }
}

pub fn is_uncompressed_audio_coding_format(format: ast::AudioCodingFormat) -> bool {
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
  #[allow(clippy::identity_op)]
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
