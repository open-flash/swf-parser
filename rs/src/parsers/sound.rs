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
