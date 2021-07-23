use crate::streaming::basic_data_types::{parse_s_rgb8, parse_straight_s_rgba8};
use nom::number::complete::le_u8 as parse_u8;
use nom::IResult as NomResult;
use swf_types as swf;

#[allow(unused_variables)]
pub fn parse_color_stop(input: &[u8], with_alpha: bool) -> NomResult<&[u8], swf::ColorStop> {
  use nom::combinator::map;

  let (input, ratio) = parse_u8(input)?;
  let (input, color) = if with_alpha {
    parse_straight_s_rgba8(input)?
  } else {
    map(parse_s_rgb8, |c| swf::StraightSRgba8 {
      r: c.r,
      g: c.g,
      b: c.b,
      a: 255,
    })(input)?
  };

  Ok((input, swf::ColorStop { ratio, color }))
}

pub fn parse_gradient(input: &[u8], with_alpha: bool) -> NomResult<&[u8], swf::Gradient> {
  let (input, flags) = parse_u8(input)?;
  let spread_code = flags >> 6;
  let color_space_code = (flags & ((1 << 6) - 1)) >> 4;
  let color_count = flags & ((1 << 4) - 1);

  let spread = match spread_code {
    0 => swf::GradientSpread::Pad,
    1 => swf::GradientSpread::Reflect,
    2 => swf::GradientSpread::Repeat,
    _ => return Err(nom::Err::Error(nom::error::Error::new(input, nom::error::ErrorKind::Switch))),
  };

  let color_space = match color_space_code {
    0 => swf::ColorSpace::SRgb,
    1 => swf::ColorSpace::LinearRgb,
    _ => return Err(nom::Err::Error(nom::error::Error::new(input, nom::error::ErrorKind::Switch))),
  };

  let (input, colors) = nom::multi::count(|i| parse_color_stop(i, with_alpha), color_count as usize)(input)?;

  Ok((
    input,
    swf::Gradient {
      spread,
      color_space,
      colors,
    },
  ))
}

#[allow(unused_variables)]
pub fn parse_morph_color_stop(input: &[u8], with_alpha: bool) -> NomResult<&[u8], swf::MorphColorStop> {
  let (input, start) = parse_color_stop(input, with_alpha)?;
  let (input, end) = parse_color_stop(input, with_alpha)?;

  Ok((
    input,
    swf::MorphColorStop {
      ratio: start.ratio,
      color: start.color,
      morph_ratio: end.ratio,
      morph_color: end.color,
    },
  ))
}

#[allow(unused_variables)]
pub fn parse_morph_gradient(input: &[u8], with_alpha: bool) -> NomResult<&[u8], swf::MorphGradient> {
  let (input, flags) = parse_u8(input)?;
  let spread_code = flags >> 6;
  let color_space_code = (flags & ((1 << 6) - 1)) >> 4;
  let color_count = flags & ((1 << 4) - 1);

  let spread = match spread_code {
    0 => swf::GradientSpread::Pad,
    1 => swf::GradientSpread::Reflect,
    2 => swf::GradientSpread::Repeat,
    _ => return Err(nom::Err::Error(nom::error::Error::new(input, nom::error::ErrorKind::Switch))),
  };

  let color_space = match color_space_code {
    0 => swf::ColorSpace::SRgb,
    1 => swf::ColorSpace::LinearRgb,
    _ => return Err(nom::Err::Error(nom::error::Error::new(input, nom::error::ErrorKind::Switch))),
  };

  let (input, colors) = nom::multi::count(|i| parse_morph_color_stop(i, with_alpha), color_count as usize)(input)?;

  Ok((
    input,
    swf::MorphGradient {
      spread,
      color_space,
      colors,
    },
  ))
}
