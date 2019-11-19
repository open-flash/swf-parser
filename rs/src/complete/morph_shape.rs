use crate::complete::gradient::parse_morph_gradient;
use crate::complete::shape::{
  cap_style_from_code, parse_curved_edge_bits, parse_list_length, parse_straight_edge_bits, StyleBits,
};
use crate::streaming::basic_data_types::{
  do_parse_u16_bits, do_parse_u32_bits, parse_bool_bits, parse_i32_bits, parse_le_fixed8_p8, parse_matrix,
  parse_straight_s_rgba8, parse_u16_bits,
};
use nom::number::complete::{le_u16 as parse_le_u16, le_u8 as parse_u8};
use nom::{IResult as NomResult, Needed};
use std::convert::TryFrom;
use swf_tree as ast;

#[derive(PartialEq, Eq, Clone, Copy, Ord, PartialOrd)]
pub enum MorphShapeVersion {
  MorphShape1,
  MorphShape2,
}

pub fn parse_morph_shape(input: &[u8], version: MorphShapeVersion) -> NomResult<&[u8], ast::MorphShape> {
  use nom::bits::bits;
  use nom::bytes::complete::take;
  // Skip offset to end records
  // TODO: Read this offset and assert that it is valid
  let (input, _end_offset) = take(4usize)(input)?;
  bits(|i| parse_morph_shape_bits(i, version))(input)
}

pub fn parse_morph_shape_bits(
  input: (&[u8], usize),
  version: MorphShapeVersion,
) -> NomResult<(&[u8], usize), ast::MorphShape> {
  let (input, styles) = parse_morph_shape_styles_bits(input, version)?;
  let (input, start_records) = parse_morph_shape_start_record_string_bits(input, styles.bits, version)?;
  let (input, style_bits) = nom::bits::bytes(parse_style_bits_len)(input)?;
  let (input, records) = parse_morph_shape_end_record_string_bits(input, start_records, style_bits, version)?;

  Ok((
    input,
    ast::MorphShape {
      initial_styles: ast::MorphShapeStyles {
        fill: styles.fill,
        line: styles.line,
      },
      records,
    },
  ))
}

fn parse_style_bits_len(input: &[u8]) -> NomResult<&[u8], StyleBits> {
  use nom::bits::bits;;
  bits(parse_style_bits_len_bits)(input)
}

fn parse_style_bits_len_bits(input: (&[u8], usize)) -> NomResult<(&[u8], usize), StyleBits> {
  use nom::combinator::map;

  let (input, fill) = map(do_parse_u32_bits(4), |x| usize::try_from(x).unwrap())(input)?;
  let (input, line) = map(do_parse_u32_bits(4), |x| usize::try_from(x).unwrap())(input)?;

  Ok((input, StyleBits { fill, line }))
}

pub struct InternalMorphShapeStyles {
  pub fill: Vec<ast::MorphFillStyle>,
  pub line: Vec<ast::MorphLineStyle>,
  pub bits: StyleBits,
}

pub fn parse_morph_shape_styles_bits(
  input: (&[u8], usize),
  version: MorphShapeVersion,
) -> NomResult<(&[u8], usize), InternalMorphShapeStyles> {
  use nom::bits::bytes;
  use nom::combinator::map;

  let (input, fill) = bytes(parse_morph_fill_style_list)(input)?;
  let (input, line) = bytes(|i| parse_morph_line_style_list(i, version))(input)?;
  let (input, fill_bits) = map(do_parse_u32_bits(4), |x| usize::try_from(x).unwrap())(input)?;
  let (input, line_bits) = map(do_parse_u32_bits(4), |x| usize::try_from(x).unwrap())(input)?;

  Ok((
    input,
    InternalMorphShapeStyles {
      fill,
      line,
      bits: StyleBits {
        fill: fill_bits,
        line: line_bits,
      },
    },
  ))
}

enum MixedShapeRecord {
  Edge(ast::shape_records::Edge),
  MorphStyleChange(ast::shape_records::MorphStyleChange),
}

fn parse_morph_shape_start_record_string_bits(
  input: (&[u8], usize),
  mut style_bits: StyleBits,
  version: MorphShapeVersion,
) -> NomResult<(&[u8], usize), Vec<MixedShapeRecord>> {
  let mut result: Vec<MixedShapeRecord> = Vec::new();
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
      result.push(MixedShapeRecord::Edge(edge));
    } else {
      let (next_input, (style_change, next_style_bits)) =
        parse_morph_style_change_bits(current_input, style_bits, version)?;
      style_bits = next_style_bits;
      result.push(MixedShapeRecord::MorphStyleChange(style_change));
      current_input = next_input;
    }
  }

  Ok((current_input, result))
}

fn as_morph_shape_record(start: MixedShapeRecord, end: MixedShapeRecord) -> Result<ast::MorphShapeRecord, ()> {
  match (start, end) {
    (MixedShapeRecord::Edge(s), MixedShapeRecord::Edge(e)) => {
      Ok(ast::MorphShapeRecord::Edge(ast::shape_records::MorphEdge {
        delta: s.delta,
        morph_delta: e.delta,
        control_delta: s.control_delta,
        morph_control_delta: e.control_delta,
      }))
    }
    (MixedShapeRecord::MorphStyleChange(s), MixedShapeRecord::MorphStyleChange(e)) => Ok(
      ast::MorphShapeRecord::StyleChange(ast::shape_records::MorphStyleChange {
        move_to: s.move_to,
        morph_move_to: e.move_to,
        left_fill: s.left_fill,
        right_fill: s.right_fill,
        line_style: s.line_style,
        new_styles: s.new_styles,
      }),
    ),
    _ => Err(()),
  }
}

fn parse_morph_shape_end_record_string_bits(
  input: (&[u8], usize),
  start_records: Vec<MixedShapeRecord>,
  mut style_bits: StyleBits,
  version: MorphShapeVersion,
) -> NomResult<(&[u8], usize), Vec<ast::MorphShapeRecord>> {
  let mut result: Vec<ast::MorphShapeRecord> = Vec::new();
  let mut current_input = input;

  for start_record in start_records.into_iter() {
    let start_record = match start_record {
      MixedShapeRecord::MorphStyleChange(sr) => {
        if sr.move_to.is_none() {
          // The end shape contains only edge (straight or curved) or moveTo records, it matches the start records
          result.push(ast::MorphShapeRecord::StyleChange(sr));
          continue;
        } else {
          MixedShapeRecord::MorphStyleChange(sr)
        }
      }
      sr => sr,
    };

    match parse_u16_bits(current_input, 6) {
      Ok((_, 0)) => {
        // Missing morph shape end record
        return Err(nom::Err::Error((input, nom::error::ErrorKind::Verify)));
      }
      Ok((_, _)) => {}
      Err(e) => return Err(e),
    };

    let is_edge = match parse_bool_bits(current_input) {
      Ok((next_input, is_edge)) => {
        current_input = next_input;
        is_edge
      }
      Err(e) => return Err(e),
    };

    let end_record = if is_edge {
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
      MixedShapeRecord::Edge(edge)
    } else {
      let (next_input, (style_change, next_style_bits)) =
        parse_morph_style_change_bits(current_input, style_bits, version)?;
      style_bits = next_style_bits;
      current_input = next_input;
      MixedShapeRecord::MorphStyleChange(style_change)
    };
    let morph_shape_record = as_morph_shape_record(start_record, end_record)
      .map_err(|_| nom::Err::Error((input, nom::error::ErrorKind::Switch)))?;
    result.push(morph_shape_record);
  }

  Ok((current_input, result))
}

pub fn parse_morph_style_change_bits(
  input: (&[u8], usize),
  style_bits: StyleBits,
  version: MorphShapeVersion,
) -> NomResult<(&[u8], usize), (ast::shape_records::MorphStyleChange, StyleBits)> {
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
  let (input, (new_styles, style_bits)) = if has_new_styles {
    let (input, styles) = parse_morph_shape_styles_bits(input, version)?;
    (
      input,
      (
        Some(ast::MorphShapeStyles {
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
      ast::shape_records::MorphStyleChange {
        move_to,
        morph_move_to: Option::None,
        left_fill: left_fill.map(|x| x as usize),
        right_fill: right_fill.map(|x| x as usize),
        line_style: line_style.map(|x| x as usize),
        new_styles,
      },
      style_bits,
    ),
  ))
}

pub fn parse_morph_fill_style_list(input: &[u8]) -> NomResult<&[u8], Vec<ast::MorphFillStyle>> {
  use nom::multi::count;
  let (input, style_count) = parse_list_length(input, true)?;
  count(parse_morph_fill_style, style_count)(input)
}

pub fn parse_morph_fill_style(input: &[u8]) -> NomResult<&[u8], ast::MorphFillStyle> {
  use nom::combinator::map;
  let (input, code) = parse_u8(input)?;
  match code {
    0x00 => map(parse_morph_solid_fill, ast::MorphFillStyle::Solid)(input),
    0x10 => map(parse_morph_linear_gradient_fill, ast::MorphFillStyle::LinearGradient)(input),
    0x12 => map(parse_morph_radial_gradient_fill, ast::MorphFillStyle::RadialGradient)(input),
    0x13 => map(parse_morph_focal_gradient_fill, ast::MorphFillStyle::FocalGradient)(input),
    0x40 => map(|i| parse_morph_bitmap_fill(i, true, true), ast::MorphFillStyle::Bitmap)(input),
    0x41 => map(|i| parse_morph_bitmap_fill(i, false, true), ast::MorphFillStyle::Bitmap)(input),
    0x42 => map(|i| parse_morph_bitmap_fill(i, true, false), ast::MorphFillStyle::Bitmap)(input),
    0x43 => map(
      |i| parse_morph_bitmap_fill(i, false, false),
      ast::MorphFillStyle::Bitmap,
    )(input),
    _ => Err(nom::Err::Error((input, nom::error::ErrorKind::Switch))),
  }
}

pub fn parse_morph_bitmap_fill(
  input: &[u8],
  repeating: bool,
  smoothed: bool,
) -> NomResult<&[u8], ast::fill_styles::MorphBitmap> {
  let (input, bitmap_id) = parse_le_u16(input)?;
  let (input, matrix) = parse_matrix(input)?;
  let (input, morph_matrix) = parse_matrix(input)?;
  Ok((
    input,
    ast::fill_styles::MorphBitmap {
      bitmap_id,
      matrix,
      morph_matrix,
      repeating,
      smoothed,
    },
  ))
}

pub fn parse_morph_focal_gradient_fill(input: &[u8]) -> NomResult<&[u8], ast::fill_styles::MorphFocalGradient> {
  let (input, matrix) = parse_matrix(input)?;
  let (input, morph_matrix) = parse_matrix(input)?;
  let (input, gradient) = parse_morph_gradient(input, true)?;
  let (input, focal_point) = parse_le_fixed8_p8(input)?;
  let (input, morph_focal_point) = parse_le_fixed8_p8(input)?;

  Ok((
    input,
    ast::fill_styles::MorphFocalGradient {
      matrix,
      morph_matrix,
      gradient,
      focal_point,
      morph_focal_point,
    },
  ))
}

pub fn parse_morph_linear_gradient_fill(input: &[u8]) -> NomResult<&[u8], ast::fill_styles::MorphLinearGradient> {
  let (input, matrix) = parse_matrix(input)?;
  let (input, morph_matrix) = parse_matrix(input)?;
  let (input, gradient) = parse_morph_gradient(input, true)?;

  Ok((
    input,
    ast::fill_styles::MorphLinearGradient {
      matrix,
      morph_matrix,
      gradient,
    },
  ))
}

pub fn parse_morph_radial_gradient_fill(input: &[u8]) -> NomResult<&[u8], ast::fill_styles::MorphRadialGradient> {
  let (input, matrix) = parse_matrix(input)?;
  let (input, morph_matrix) = parse_matrix(input)?;
  let (input, gradient) = parse_morph_gradient(input, true)?;

  Ok((
    input,
    ast::fill_styles::MorphRadialGradient {
      matrix,
      morph_matrix,
      gradient,
    },
  ))
}

pub fn parse_morph_solid_fill(input: &[u8]) -> NomResult<&[u8], ast::fill_styles::MorphSolid> {
  let (input, color) = parse_straight_s_rgba8(input)?;
  let (input, morph_color) = parse_straight_s_rgba8(input)?;
  Ok((input, ast::fill_styles::MorphSolid { color, morph_color }))
}

pub fn parse_morph_line_style_list(
  input: &[u8],
  version: MorphShapeVersion,
) -> NomResult<&[u8], Vec<ast::MorphLineStyle>> {
  use nom::multi::count;
  let (input, style_count) = parse_list_length(input, true)?;
  count(
    if version >= MorphShapeVersion::MorphShape2 {
      parse_morph_line_style2
    } else {
      parse_morph_line_style1
    },
    style_count,
  )(input)
}

pub fn parse_morph_line_style1(input: &[u8]) -> NomResult<&[u8], ast::MorphLineStyle> {
  let (input, width) = parse_le_u16(input)?;
  let (input, morph_width) = parse_le_u16(input)?;
  let (input, color) = parse_straight_s_rgba8(input)?;
  let (input, morph_color) = parse_straight_s_rgba8(input)?;
  Ok((
    input,
    ast::MorphLineStyle {
      width,
      morph_width,
      start_cap: ast::CapStyle::Round,
      end_cap: ast::CapStyle::Round,
      join: ast::JoinStyle::Round,
      no_h_scale: false,
      no_v_scale: false,
      no_close: false,
      pixel_hinting: false,
      fill: ast::MorphFillStyle::Solid(ast::fill_styles::MorphSolid { color, morph_color }),
    },
  ))
}

pub fn parse_morph_line_style2(input: &[u8]) -> NomResult<&[u8], ast::MorphLineStyle> {
  use nom::combinator::map;

  let (input, width) = parse_le_u16(input)?;
  let (input, morph_width) = parse_le_u16(input)?;
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
    2 => map(parse_le_u16, |limit| {
      ast::JoinStyle::Miter(ast::join_styles::Miter { limit })
    })(input)?,
    _ => return Err(nom::Err::Error((input, nom::error::ErrorKind::Switch))),
  };
  let (input, fill) = if has_fill {
    parse_morph_fill_style(input)?
  } else {
    let (input, color) = parse_straight_s_rgba8(input)?;
    let (input, morph_color) = parse_straight_s_rgba8(input)?;
    (
      input,
      ast::MorphFillStyle::Solid(ast::fill_styles::MorphSolid { color, morph_color }),
    )
  };

  Ok((
    input,
    ast::MorphLineStyle {
      width,
      morph_width,
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
