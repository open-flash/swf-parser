use crate::parsers::basic_data_types::{parse_s_rgb8, parse_straight_s_rgba8};
use nom::le_u8 as parse_u8;
use nom::IResult;
use swf_tree as ast;

#[allow(unused_variables)]
pub fn parse_color_stop(input: &[u8], with_alpha: bool) -> IResult<&[u8], ast::ColorStop> {
  do_parse!(
    input,
    ratio: parse_u8
      >> color:
        switch!(value!(with_alpha),
          true => call!(parse_straight_s_rgba8) |
          false => map!(parse_s_rgb8, |c| ast::StraightSRgba8 {r: c.r, g: c.g, b: c.b, a: 255})
        )
      >> (ast::ColorStop {
        ratio: ratio,
        color: color,
      })
  )
}

#[allow(unused_variables)]
pub fn parse_gradient(input: &[u8], with_alpha: bool) -> IResult<&[u8], ast::Gradient> {
  do_parse!(
    input,
    flags: parse_u8
      >> spread_id: value!(flags >> 6)
      >> color_space_id: value!((flags & ((1 << 6) - 1)) >> 4)
      >> color_count: value!(flags & ((1 << 4) - 1))
      >> spread:
        switch!(value!(spread_id),
          0 => value!(ast::GradientSpread::Pad) |
          1 => value!(ast::GradientSpread::Reflect) |
          2 => value!(ast::GradientSpread::Repeat)
          // TODO: Default to error
        )
      >> color_space:
        switch!(value!(color_space_id),
          0 => value!(ast::ColorSpace::SRgb) |
          1 => value!(ast::ColorSpace::LinearRgb)
          // TODO: Default to error
        )
      >> colors: length_count!(value!(color_count), apply!(parse_color_stop, with_alpha))
      >> (ast::Gradient {
        spread: spread,
        color_space: color_space,
        colors: colors,
      })
  )
}

#[allow(unused_variables)]
pub fn parse_morph_color_stop(input: &[u8], with_alpha: bool) -> IResult<&[u8], ast::MorphColorStop> {
  do_parse!(
    input,
    start: apply!(parse_color_stop, with_alpha)
      >> end: apply!(parse_color_stop, with_alpha)
      >> (ast::MorphColorStop {
        ratio: start.ratio,
        color: start.color,
        morph_ratio: end.ratio,
        morph_color: end.color,
      })
  )
}

#[allow(unused_variables)]
pub fn parse_morph_gradient(input: &[u8], with_alpha: bool) -> IResult<&[u8], ast::MorphGradient> {
  do_parse!(
    input,
    flags: parse_u8
      >> spread_id: value!(flags >> 6)
      >> color_space_id: value!((flags & ((1 << 6) - 1)) >> 4)
      >> color_count: value!(flags & ((1 << 4) - 1))
      >> spread:
        switch!(value!(spread_id),
          0 => value!(ast::GradientSpread::Pad) |
          1 => value!(ast::GradientSpread::Reflect) |
          2 => value!(ast::GradientSpread::Repeat)
          // TODO: Default to error
        )
      >> color_space:
        switch!(value!(color_space_id),
          0 => value!(ast::ColorSpace::SRgb) |
          1 => value!(ast::ColorSpace::LinearRgb)
          // TODO: Default to error
        )
      >> colors: length_count!(value!(color_count), apply!(parse_morph_color_stop, with_alpha))
      >> (ast::MorphGradient {
        spread: spread,
        color_space: color_space,
        colors: colors,
      })
  )
}
