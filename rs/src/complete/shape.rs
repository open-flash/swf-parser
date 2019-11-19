use crate::complete::gradient::parse_gradient;
use crate::streaming::basic_data_types::{
  do_parse_i32_bits, do_parse_u16_bits, do_parse_u32_bits, parse_bool_bits, parse_i32_bits, parse_le_fixed8_p8,
  parse_matrix, parse_s_rgb8, parse_straight_s_rgba8, parse_u16_bits,
};
use nom::number::complete::{le_u16 as parse_le_u16, le_u8 as parse_u8};
use nom::{IResult as NomResult, Needed};
use std::convert::TryFrom;
use swf_tree as ast;

#[derive(PartialEq, Eq, Clone, Copy, Ord, PartialOrd)]
pub enum ShapeVersion {
  Shape1,
  Shape2,
  Shape3,
  Shape4,
}

pub fn parse_glyph(input: &[u8]) -> NomResult<&[u8], ast::Glyph> {
  use nom::bits::bits;
  bits(parse_glyph_bits)(input)
}

pub fn parse_glyph_bits(input: (&[u8], usize)) -> NomResult<(&[u8], usize), ast::Glyph> {
  use nom::combinator::map;

  let (input, fill) = map(do_parse_u32_bits(4), |x| usize::try_from(x).unwrap())(input)?;
  let (input, line) = map(do_parse_u32_bits(4), |x| usize::try_from(x).unwrap())(input)?;
  let style_bits = StyleBits { fill, line };
  let (input, records) = parse_shape_record_string_bits(input, style_bits, ShapeVersion::Shape1)?;

  Ok((input, ast::Glyph { records }))
}

pub fn parse_shape(input: &[u8], version: ShapeVersion) -> NomResult<&[u8], ast::Shape> {
  use nom::bits::bits;
  bits(|i| parse_shape_bits(i, version))(input)
}

pub fn parse_shape_bits(input: (&[u8], usize), version: ShapeVersion) -> NomResult<(&[u8], usize), ast::Shape> {
  let (input, styles) = parse_shape_styles_bits(input, version)?;
  let (input, records) = parse_shape_record_string_bits(input, styles.bits, version)?;

  Ok((
    input,
    ast::Shape {
      initial_styles: ast::ShapeStyles {
        fill: styles.fill,
        line: styles.line,
      },
      records,
    },
  ))
}

// TODO: Rename to ShapeStylesWithBits
pub struct ShapeStyles {
  pub fill: Vec<ast::FillStyle>,
  pub line: Vec<ast::LineStyle>,
  pub bits: StyleBits,
}

#[derive(Copy, Clone)]
pub struct StyleBits {
  pub fill: usize,
  pub line: usize,
}

pub fn parse_shape_styles_bits(input: (&[u8], usize), version: ShapeVersion) -> NomResult<(&[u8], usize), ShapeStyles> {
  use nom::bits::bytes;
  use nom::combinator::map;

  let (input, fill) = bytes(|i| parse_fill_style_list(i, version))(input)?;
  let (input, line) = bytes(|i| parse_line_style_list(i, version))(input)?;
  let (input, fill_bits) = map(do_parse_u32_bits(4), |x| usize::try_from(x).unwrap())(input)?;
  let (input, line_bits) = map(do_parse_u32_bits(4), |x| usize::try_from(x).unwrap())(input)?;

  Ok((
    input,
    ShapeStyles {
      fill,
      line,
      bits: StyleBits {
        fill: fill_bits,
        line: line_bits,
      },
    },
  ))
}

pub fn parse_shape_record_string_bits(
  input: (&[u8], usize),
  mut style_bits: StyleBits,
  version: ShapeVersion,
) -> NomResult<(&[u8], usize), Vec<ast::ShapeRecord>> {
  let mut result: Vec<ast::ShapeRecord> = Vec::new();
  let mut current_input = input;

  loop {
    match parse_u16_bits(current_input, 6) {
      Ok((next_input, record_head)) => {
        if record_head == 0 {
          current_input = next_input;
          break;
        }
      }
      Err(::nom::Err::Incomplete(_)) => return Err(::nom::Err::Incomplete(Needed::Unknown)),
      Err(e) => return Err(e),
    };

    let is_edge = match parse_bool_bits(current_input) {
      Ok((next_input, is_edge)) => {
        current_input = next_input;
        is_edge
      }
      Err(::nom::Err::Incomplete(_)) => return Err(::nom::Err::Incomplete(Needed::Unknown)),
      Err(e) => return Err(e),
    };

    if is_edge {
      let is_straight_edge = match parse_bool_bits(current_input) {
        Ok((next_input, is_straight_edge)) => {
          current_input = next_input;
          is_straight_edge
        }
        Err(::nom::Err::Incomplete(_)) => return Err(::nom::Err::Incomplete(Needed::Unknown)),
        Err(e) => return Err(e),
      };
      let (next_input, edge) = if is_straight_edge {
        parse_straight_edge_bits(current_input)?
      } else {
        parse_curved_edge_bits(current_input)?
      };
      current_input = next_input;
      result.push(ast::ShapeRecord::Edge(edge));
    } else {
      let (next_input, (style_change, next_style_bits)) = parse_style_change_bits(current_input, style_bits, version)?;
      style_bits = next_style_bits;
      result.push(ast::ShapeRecord::StyleChange(style_change));
      current_input = next_input;
    }
  }

  Ok((current_input, result))
}

pub fn parse_curved_edge_bits(input: (&[u8], usize)) -> NomResult<(&[u8], usize), ast::shape_records::Edge> {
  let (input, n_bits) = parse_u16_bits(input, 4).map(|(i, x)| (i, (x as usize) + 2))?;
  let (input, control_x) = parse_i32_bits(input, n_bits)?;
  let (input, control_y) = parse_i32_bits(input, n_bits)?;
  let (input, anchor_x) = parse_i32_bits(input, n_bits)?;
  let (input, anchor_y) = parse_i32_bits(input, n_bits)?;

  Ok((
    input,
    ast::shape_records::Edge {
      delta: ast::Vector2D {
        x: control_x + anchor_x,
        y: control_y + anchor_y,
      },
      control_delta: Some(ast::Vector2D {
        x: control_x,
        y: control_y,
      }),
    },
  ))
}

pub fn parse_straight_edge_bits(input: (&[u8], usize)) -> NomResult<(&[u8], usize), ast::shape_records::Edge> {
  use nom::combinator::{cond, map};

  let (input, n_bits) = map(do_parse_u16_bits(4), |x| (x as usize) + 2)(input)?;
  let (input, is_diagonal) = parse_bool_bits(input)?;
  let (input, is_vertical) = if is_diagonal {
    (input, false)
  } else {
    parse_bool_bits(input)?
  };
  let (input, delta_x) = map(
    cond(is_diagonal || !is_vertical, do_parse_i32_bits(n_bits)),
    Option::unwrap_or_default,
  )(input)?;
  let (input, delta_y) = map(
    cond(is_diagonal || is_vertical, do_parse_i32_bits(n_bits)),
    Option::unwrap_or_default,
  )(input)?;

  Ok((
    input,
    ast::shape_records::Edge {
      delta: ast::Vector2D { x: delta_x, y: delta_y },
      control_delta: None,
    },
  ))
}

pub fn parse_style_change_bits(
  input: (&[u8], usize),
  style_bits: StyleBits,
  version: ShapeVersion,
) -> NomResult<(&[u8], usize), (ast::shape_records::StyleChange, StyleBits)> {
  use nom::combinator::cond;

  let (input, has_new_styles) = parse_bool_bits(input)?;
  let (input, change_line_style) = parse_bool_bits(input)?;
  let (input, change_right_fill) = parse_bool_bits(input)?;
  let (input, change_left_fill) = parse_bool_bits(input)?;
  let (input, has_move_to) = parse_bool_bits(input)?;
  let (input, move_to) = if has_move_to {
    let (input, move_to_bits) = parse_u16_bits(input, 5)?;
    let (input, x) = parse_i32_bits(input, move_to_bits as usize)?;
    let (input, y) = parse_i32_bits(input, move_to_bits as usize)?;
    (input, Some(ast::Vector2D { x, y }))
  } else {
    (input, None)
  };
  let (input, left_fill) = cond(change_left_fill, do_parse_u16_bits(style_bits.fill))(input)?;
  let (input, right_fill) = cond(change_right_fill, do_parse_u16_bits(style_bits.fill))(input)?;
  let (input, line_style) = cond(change_line_style, do_parse_u16_bits(style_bits.line))(input)?;
  let (input, (new_styles, next_style_bits)) = if has_new_styles {
    let (input, styles) = parse_shape_styles_bits(input, version)?;
    (
      input,
      (
        Some(ast::ShapeStyles {
          fill: styles.fill,
          line: styles.line,
        }),
        styles.bits,
      ),
    )
  } else {
    (input, (None, style_bits))
  };

  Ok((
    input,
    (
      ast::shape_records::StyleChange {
        move_to,
        left_fill: left_fill.map(usize::from),
        right_fill: right_fill.map(usize::from),
        line_style: line_style.map(usize::from),
        new_styles,
      },
      next_style_bits,
    ),
  ))
}

pub fn parse_list_length(input: &[u8], allow_extended: bool) -> NomResult<&[u8], usize> {
  let (remaining_input, u8_len) = parse_u8(input)?;
  if u8_len == 0xff && allow_extended {
    parse_le_u16(remaining_input).map(|(i, x)| (i, x as usize))
  } else {
    Ok((remaining_input, u8_len as usize))
  }
}

pub fn parse_fill_style_list(input: &[u8], version: ShapeVersion) -> NomResult<&[u8], Vec<ast::FillStyle>> {
  use nom::multi::count;
  let (input, style_count) = parse_list_length(input, version >= ShapeVersion::Shape2)?;
  count(|i| parse_fill_style(i, version >= ShapeVersion::Shape3), style_count)(input)
}

pub fn parse_fill_style(input: &[u8], with_alpha: bool) -> NomResult<&[u8], ast::FillStyle> {
  use nom::combinator::map;
  let (input, code) = parse_u8(input)?;
  match code {
    0x00 => map(|i| parse_solid_fill(i, with_alpha), ast::FillStyle::Solid)(input),
    0x10 => map(
      |i| parse_linear_gradient_fill(i, with_alpha),
      ast::FillStyle::LinearGradient,
    )(input),
    0x12 => map(
      |i| parse_radial_gradient_fill(i, with_alpha),
      ast::FillStyle::RadialGradient,
    )(input),
    0x13 => map(
      |i| parse_focal_gradient_fill(i, with_alpha),
      ast::FillStyle::FocalGradient,
    )(input),
    0x40 => map(|i| parse_bitmap_fill(i, true, true), ast::FillStyle::Bitmap)(input),
    0x41 => map(|i| parse_bitmap_fill(i, false, true), ast::FillStyle::Bitmap)(input),
    0x42 => map(|i| parse_bitmap_fill(i, true, false), ast::FillStyle::Bitmap)(input),
    0x43 => map(|i| parse_bitmap_fill(i, false, false), ast::FillStyle::Bitmap)(input),
    _ => Err(nom::Err::Error((input, nom::error::ErrorKind::Switch))),
  }
}

pub fn parse_bitmap_fill(input: &[u8], repeating: bool, smoothed: bool) -> NomResult<&[u8], ast::fill_styles::Bitmap> {
  let (input, bitmap_id) = parse_le_u16(input)?;
  let (input, matrix) = parse_matrix(input)?;
  Ok((
    input,
    ast::fill_styles::Bitmap {
      bitmap_id,
      matrix,
      repeating,
      smoothed,
    },
  ))
}

pub fn parse_focal_gradient_fill(input: &[u8], with_alpha: bool) -> NomResult<&[u8], ast::fill_styles::FocalGradient> {
  let (input, matrix) = parse_matrix(input)?;
  let (input, gradient) = parse_gradient(input, with_alpha)?;
  let (input, focal_point) = parse_le_fixed8_p8(input)?;

  Ok((
    input,
    ast::fill_styles::FocalGradient {
      matrix,
      gradient,
      focal_point,
    },
  ))
}

pub fn parse_linear_gradient_fill(
  input: &[u8],
  with_alpha: bool,
) -> NomResult<&[u8], ast::fill_styles::LinearGradient> {
  let (input, matrix) = parse_matrix(input)?;
  let (input, gradient) = parse_gradient(input, with_alpha)?;

  Ok((input, ast::fill_styles::LinearGradient { matrix, gradient }))
}

pub fn parse_radial_gradient_fill(
  input: &[u8],
  with_alpha: bool,
) -> NomResult<&[u8], ast::fill_styles::RadialGradient> {
  let (input, matrix) = parse_matrix(input)?;
  let (input, gradient) = parse_gradient(input, with_alpha)?;

  Ok((input, ast::fill_styles::RadialGradient { matrix, gradient }))
}

pub fn parse_solid_fill(input: &[u8], with_alpha: bool) -> NomResult<&[u8], ast::fill_styles::Solid> {
  use nom::combinator::map;
  let (input, color) = if with_alpha {
    parse_straight_s_rgba8(input)?
  } else {
    map(parse_s_rgb8, |c| ast::StraightSRgba8 {
      r: c.r,
      g: c.g,
      b: c.b,
      a: 255,
    })(input)?
  };
  Ok((input, ast::fill_styles::Solid { color }))
}

pub fn parse_line_style_list(input: &[u8], version: ShapeVersion) -> NomResult<&[u8], Vec<ast::LineStyle>> {
  use nom::multi::count;
  let (input, style_count) = parse_list_length(input, version >= ShapeVersion::Shape2)?;

  if version >= ShapeVersion::Shape4 {
    count(parse_line_style2, style_count)(input)
  } else {
    count(|i| parse_line_style(i, version >= ShapeVersion::Shape3), style_count)(input)
  }
}

pub fn parse_line_style(input: &[u8], with_alpha: bool) -> NomResult<&[u8], ast::LineStyle> {
  use nom::combinator::map;
  let (input, width) = parse_le_u16(input)?;
  let (input, color) = if with_alpha {
    parse_straight_s_rgba8(input)?
  } else {
    map(parse_s_rgb8, |c| ast::StraightSRgba8 {
      r: c.r,
      g: c.g,
      b: c.b,
      a: 255,
    })(input)?
  };
  Ok((
    input,
    ast::LineStyle {
      width,
      start_cap: ast::CapStyle::Round,
      end_cap: ast::CapStyle::Round,
      join: ast::JoinStyle::Round,
      no_h_scale: false,
      no_v_scale: false,
      no_close: false,
      pixel_hinting: false,
      fill: ast::FillStyle::Solid(ast::fill_styles::Solid { color }),
    },
  ))
}

pub(crate) fn cap_style_from_code(cap_style_code: u16) -> Result<ast::CapStyle, ()> {
  match cap_style_code {
    0 => Ok(ast::CapStyle::Round),
    1 => Ok(ast::CapStyle::None),
    2 => Ok(ast::CapStyle::Square),
    _ => Err(()),
  }
}

pub fn parse_line_style2(input: &[u8]) -> NomResult<&[u8], ast::LineStyle> {
  use nom::combinator::map;

  let (input, width) = parse_le_u16(input)?;

  let (input, flags) = parse_le_u16(input)?;
  #[allow(clippy::identity_op)]
  let pixel_hinting = (flags & (1 << 0)) != 0;
  let no_v_scale = (flags & (1 << 1)) != 0;
  let no_h_scale = (flags & (1 << 2)) != 0;
  let has_fill = (flags & (1 << 3)) != 0;
  let join_style_code = (flags >> 4) & 0b11;
  let start_cap_style_code = (flags >> 6) & 0b11;
  let end_cap_style_code = (flags >> 8) & 0b11;
  let no_close = (flags & (1 << 10)) != 0;
  // (Skip bits [11, 15])

  let start_cap =
    cap_style_from_code(start_cap_style_code).map_err(|_| nom::Err::Error((input, nom::error::ErrorKind::Switch)))?;
  let end_cap =
    cap_style_from_code(end_cap_style_code).map_err(|_| nom::Err::Error((input, nom::error::ErrorKind::Switch)))?;

  let (input, join) = match join_style_code {
    0 => (input, ast::JoinStyle::Round),
    1 => (input, ast::JoinStyle::Bevel),
    2 => {
      let (input, limit) = parse_le_u16(input)?;
      (input, ast::JoinStyle::Miter(ast::join_styles::Miter { limit }))
    }
    _ => return Err(nom::Err::Error((input, nom::error::ErrorKind::Switch))),
  };

  let (input, fill) = if has_fill {
    parse_fill_style(input, true)?
  } else {
    map(parse_straight_s_rgba8, |color| {
      ast::FillStyle::Solid(ast::fill_styles::Solid { color })
    })(input)?
  };

  Ok((
    input,
    ast::LineStyle {
      width,
      fill,
      pixel_hinting,
      no_v_scale,
      no_h_scale,
      no_close,
      join,
      start_cap,
      end_cap,
    },
  ))
}
