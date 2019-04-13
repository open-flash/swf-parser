use nom::{IResult as NomResult, Needed};
use nom::{le_u16 as parse_le_u16, le_u8 as parse_u8};
use swf_tree as ast;

use crate::parsers::basic_data_types::{
  parse_bool_bits,
  parse_i32_bits,
  parse_le_fixed8_p8,
  parse_matrix,
  parse_straight_s_rgba8,
  parse_u16_bits,
  parse_u32_bits,
};
use crate::parsers::gradient::parse_morph_gradient;
use crate::parsers::shape::{parse_curved_edge_bits, parse_list_length, parse_straight_edge_bits};

#[derive(PartialEq, Eq, Clone, Copy, Ord, PartialOrd)]
pub enum MorphShapeVersion {
  MorphShape1,
  MorphShape2,
}

pub fn parse_morph_shape(input: &[u8], version: MorphShapeVersion) -> NomResult<&[u8], ast::MorphShape> {
  // Skip offset to end records
  // TODO: Read this offset and assert that it is valid
  let (input, _end_offset) = take!(input, 4)?;
  bits!(input, apply!(parse_morph_shape_bits, version))
}

pub fn parse_morph_shape_bits(input: (&[u8], usize), version: MorphShapeVersion) -> NomResult<(&[u8], usize), ast::MorphShape> {
  do_parse!(
    input,
    styles: apply!(parse_morph_shape_styles_bits, version) >>
    start_records: apply!(parse_morph_shape_start_record_string_bits, styles.fill_bits, styles.line_bits, version) >>
    style_bits: bytes!(bits!(parse_style_bits_len_bits)) >>
    records: apply!(parse_morph_shape_end_record_string_bits, start_records, style_bits.0, style_bits.1, version) >>
    (ast::MorphShape {
      initial_styles: ast::MorphShapeStyles {
        fill: styles.fill,
        line: styles.line,
      },
      records: records,
    })
  )
}

fn parse_style_bits_len_bits(input: (&[u8], usize)) -> NomResult<(&[u8], usize), (usize, usize)> {
  do_parse!(
    input,
    fill_bits: map!(apply!(parse_u32_bits, 4), |x| x as usize) >>
    line_bits: map!(apply!(parse_u32_bits, 4), |x| x as usize) >>
    ((fill_bits, line_bits))
  )
}

pub struct InternalMorphShapeStyles {
  pub fill: Vec<ast::MorphFillStyle>,
  pub line: Vec<ast::MorphLineStyle>,
  pub fill_bits: usize,
  pub line_bits: usize,
}

pub fn parse_morph_shape_styles_bits(input: (&[u8], usize), version: MorphShapeVersion) -> NomResult<(&[u8], usize), InternalMorphShapeStyles> {
  do_parse!(
    input,
    fill: bytes!(parse_morph_fill_style_list) >>
    line: bytes!(apply!(parse_morph_line_style_list, version)) >>
    fill_bits: map!(apply!(parse_u32_bits, 4), |x| x as usize) >>
    line_bits: map!(apply!(parse_u32_bits, 4), |x| x as usize) >>
    (InternalMorphShapeStyles {
      fill: fill,
      line: line,
      fill_bits: fill_bits,
      line_bits: line_bits,
    })
  )
}

enum MixedShapeRecord {
  Edge(ast::shape_records::Edge),
  MorphStyleChange(ast::shape_records::MorphStyleChange),
}

fn parse_morph_shape_start_record_string_bits(input: (&[u8], usize), mut fill_bits: usize, mut line_bits: usize, version: MorphShapeVersion) -> NomResult<(&[u8], usize), Vec<MixedShapeRecord>> {
  let mut result: Vec<MixedShapeRecord> = Vec::new();
  let mut current_input = input;

  loop {
    match parse_u16_bits(current_input, 6) {
      Ok((next_input, record_head)) => if record_head == 0 {
        current_input = next_input;
        break;
      },
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
      let (next_input, (style_change, style_bits)) = parse_morph_style_change_bits(current_input, fill_bits, line_bits, version)?;
      fill_bits = style_bits.0;
      line_bits = style_bits.1;
      result.push(MixedShapeRecord::MorphStyleChange(style_change));
      current_input = next_input;
    }
  }

  Ok((current_input, result))
}

fn as_morph_shape_record(start: MixedShapeRecord, end: MixedShapeRecord) -> ast::MorphShapeRecord {
  match (start, end) {
    (MixedShapeRecord::Edge(s), MixedShapeRecord::Edge(e)) => {
      ast::MorphShapeRecord::Edge(ast::shape_records::MorphEdge {
        delta: s.delta,
        morph_delta: e.delta,
        control_delta: s.control_delta,
        morph_control_delta: e.control_delta,
      })
    }
    (MixedShapeRecord::MorphStyleChange(s), MixedShapeRecord::MorphStyleChange(e)) => {
      ast::MorphShapeRecord::StyleChange(ast::shape_records::MorphStyleChange {
        move_to: s.move_to,
        morph_move_to: e.move_to,
        left_fill: s.left_fill,
        right_fill: s.right_fill,
        line_style: s.line_style,
        new_styles: s.new_styles,
      })
    }
    _ => panic!("NonMatchingEdges")
  }
}

fn parse_morph_shape_end_record_string_bits(
  input: (&[u8], usize),
  start_records: Vec<MixedShapeRecord>,
  mut fill_bits: usize,
  mut line_bits: usize,
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
      Ok((_, 0)) => panic!("MissingMorphShapeEndRecords"),
      Ok((_, _)) => {}
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
      let (next_input, (style_change, style_bits)) = parse_morph_style_change_bits(current_input, fill_bits, line_bits, version)?;
      fill_bits = style_bits.0;
      line_bits = style_bits.1;
      current_input = next_input;
      MixedShapeRecord::MorphStyleChange(style_change)
    };
    result.push(as_morph_shape_record(start_record, end_record));
  }

  Ok((current_input, result))
}


pub fn parse_morph_style_change_bits(input: (&[u8], usize), fill_bits: usize, line_bits: usize, version: MorphShapeVersion) -> NomResult<(&[u8], usize), (ast::shape_records::MorphStyleChange, (usize, usize))> {
  do_parse!(
    input,
    has_new_styles: parse_bool_bits >>
    change_line_style: parse_bool_bits >>
    change_right_fill: parse_bool_bits >>
    change_left_fill: parse_bool_bits >>
    has_move_to: parse_bool_bits >>
    move_to: cond!(has_move_to,
      do_parse!(
        move_to_bits: map!(apply!(parse_u16_bits, 5), |bits| bits as usize) >>
        x: apply!(parse_i32_bits, move_to_bits) >>
        y: apply!(parse_i32_bits, move_to_bits) >>
        (ast::Vector2D {x: x, y: y})
      )
    ) >>
    left_fill: cond!(change_left_fill, apply!(parse_u16_bits, fill_bits)) >>
    right_fill: cond!(change_right_fill, apply!(parse_u16_bits, fill_bits)) >>
    line_style: cond!(change_line_style, apply!(parse_u16_bits, line_bits)) >>
    styles: map!(
      cond!(has_new_styles, apply!(parse_morph_shape_styles_bits, version)),
      |styles| match styles {
        Option::Some(styles) => (
          Option::Some(ast::MorphShapeStyles {fill: styles.fill, line: styles.line}),
          styles.fill_bits,
          styles.line_bits,
        ),
        Option::None => (Option::None, fill_bits, line_bits),
      }
    ) >>
    ((
      ast::shape_records::MorphStyleChange {
          move_to: move_to,
          morph_move_to: Option::None,
          left_fill: left_fill.map(|x| x as usize),
          right_fill: right_fill.map(|x| x as usize),
          line_style: line_style.map(|x| x as usize),
          new_styles: styles.0,
      },
      (styles.1, styles.2),
    ))
  )
}

pub fn parse_morph_fill_style_list(input: &[u8]) -> NomResult<&[u8], Vec<ast::MorphFillStyle>> {
  length_count!(input, apply!(parse_list_length, true), parse_morph_fill_style)
}

pub fn parse_morph_fill_style(input: &[u8]) -> NomResult<&[u8], ast::MorphFillStyle> {
  switch!(input, parse_u8,
    0x00 => map!(parse_morph_solid_fill, |fill| ast::MorphFillStyle::Solid(fill)) |
    0x10 => map!(parse_morph_linear_gradient_fill, |fill| ast::MorphFillStyle::LinearGradient(fill)) |
    0x12 => map!(parse_morph_radial_gradient_fill, |fill| ast::MorphFillStyle::RadialGradient(fill)) |
    0x13 => map!(parse_morph_focal_gradient_fill, |fill| ast::MorphFillStyle::FocalGradient(fill)) |
    0x40 => map!(apply!(parse_morph_bitmap_fill, true, true), |fill| ast::MorphFillStyle::Bitmap(fill)) |
    0x41 => map!(apply!(parse_morph_bitmap_fill, false, true), |fill| ast::MorphFillStyle::Bitmap(fill)) |
    0x42 => map!(apply!(parse_morph_bitmap_fill, true, false), |fill| ast::MorphFillStyle::Bitmap(fill)) |
    0x43 => map!(apply!(parse_morph_bitmap_fill, false, false), |fill| ast::MorphFillStyle::Bitmap(fill))
    // TODO: Error
  )
}

pub fn parse_morph_bitmap_fill(input: &[u8], repeating: bool, smoothed: bool) -> NomResult<&[u8], ast::fill_styles::MorphBitmap> {
  do_parse!(
    input,
    bitmap_id: parse_le_u16 >>
    matrix: parse_matrix >>
    morph_matrix: parse_matrix >>
    (ast::fill_styles::MorphBitmap {
      bitmap_id: bitmap_id,
      matrix: matrix,
      morph_matrix: morph_matrix,
      repeating: repeating,
      smoothed: smoothed,
    })
  )
}

pub fn parse_morph_focal_gradient_fill(input: &[u8]) -> NomResult<&[u8], ast::fill_styles::MorphFocalGradient> {
  do_parse!(
    input,
    matrix: parse_matrix >>
    morph_matrix: parse_matrix >>
    gradient: apply!(parse_morph_gradient, true) >>
    focal_point: parse_le_fixed8_p8 >>
    morph_focal_point: parse_le_fixed8_p8 >>
    (ast::fill_styles::MorphFocalGradient {
      matrix: matrix,
      morph_matrix: morph_matrix,
      gradient: gradient,
      focal_point: focal_point,
      morph_focal_point: morph_focal_point,
    })
  )
}

pub fn parse_morph_linear_gradient_fill(input: &[u8]) -> NomResult<&[u8], ast::fill_styles::MorphLinearGradient> {
  do_parse!(
    input,
    matrix: parse_matrix >>
    morph_matrix: parse_matrix >>
    gradient: apply!(parse_morph_gradient, true) >>
    (ast::fill_styles::MorphLinearGradient {
      matrix: matrix,
      morph_matrix: morph_matrix,
      gradient: gradient
    })
  )
}

pub fn parse_morph_radial_gradient_fill(input: &[u8]) -> NomResult<&[u8], ast::fill_styles::MorphRadialGradient> {
  do_parse!(
    input,
    matrix: parse_matrix >>
    morph_matrix: parse_matrix >>
    gradient: apply!(parse_morph_gradient, true) >>
    (ast::fill_styles::MorphRadialGradient {
      matrix: matrix,
      morph_matrix: morph_matrix,
      gradient: gradient
    })
  )
}

pub fn parse_morph_solid_fill(input: &[u8]) -> NomResult<&[u8], ast::fill_styles::MorphSolid> {
  do_parse!(
    input,
    color: parse_straight_s_rgba8 >>
    morph_color: parse_straight_s_rgba8 >>
    (ast::fill_styles::MorphSolid {color, morph_color})
  )
}

pub fn parse_morph_line_style_list(input: &[u8], version: MorphShapeVersion) -> NomResult<&[u8], Vec<ast::MorphLineStyle>> {
  if version >= MorphShapeVersion::MorphShape2 {
    length_count!(input, apply!(parse_list_length, true), parse_morph_line_style2)
  } else {
    length_count!(input, apply!(parse_list_length, true), parse_morph_line_style1)
  }
}

pub fn parse_morph_line_style1(input: &[u8]) -> NomResult<&[u8], ast::MorphLineStyle> {
  do_parse!(
    input,
    width: parse_le_u16 >>
    morph_width: parse_le_u16 >>
    color: parse_straight_s_rgba8 >>
    morph_color: parse_straight_s_rgba8 >>
    (ast::MorphLineStyle {
      width: width,
      morph_width: morph_width,
      start_cap: ast::CapStyle::Round,
      end_cap: ast::CapStyle::Round,
      join: ast::JoinStyle::Round,
      no_h_scale: false,
      no_v_scale: false,
      no_close: false,
      pixel_hinting: false,
      fill: ast::MorphFillStyle::Solid(ast::fill_styles::MorphSolid {
        color,
        morph_color,
      }),
    })
  )
}

pub fn parse_morph_line_style2(input: &[u8]) -> NomResult<&[u8], ast::MorphLineStyle> {
  fn cap_style_from_id(cap_style_id: u16) -> ast::CapStyle {
    match cap_style_id {
      0 => ast::CapStyle::Round,
      1 => ast::CapStyle::None,
      2 => ast::CapStyle::Square,
      _ => panic!("Unexpected cap style id"),
    }
  }

  do_parse!(
    input,
    width: parse_le_u16 >>
    morph_width: parse_le_u16 >>
    flags: parse_le_u16 >>
    pixel_hinting: value!((flags & (1 << 0)) != 0) >>
    no_v_scale: value!((flags & (1 << 1)) != 0) >>
    no_h_scale: value!((flags & (1 << 2)) != 0) >>
    has_fill: value!((flags & (1 << 3)) != 0) >>
    join_style_id: value!((flags >> 4) & 0b11) >>
    start_cap_style_id: value!((flags >> 6) & 0b11) >>
    end_cap_style_id: value!((flags >> 8) & 0b11) >>
    no_close: value!((flags & (1 << 10)) != 0) >>
    // (Skip bits [11, 15])
    start_cap: map!(value!(start_cap_style_id), cap_style_from_id) >>
    end_cap: map!(value!(end_cap_style_id), cap_style_from_id) >>
    join: switch!(value!(join_style_id),
      0 => value!(ast::JoinStyle::Round) |
      1 => value!(ast::JoinStyle::Bevel) |
      2 => do_parse!(
        limit: parse_le_u16 >>
        (ast::JoinStyle::Miter(ast::join_styles::Miter{limit}))
      )
    ) >>
    fill: switch!(value!(has_fill),
      true => call!(parse_morph_fill_style) |
      false => do_parse!(
        color: parse_straight_s_rgba8 >>
        morph_color: parse_straight_s_rgba8 >>
        (ast::MorphFillStyle::Solid(ast::fill_styles::MorphSolid { color, morph_color }))
      )
    ) >>
    (ast::MorphLineStyle {
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
    })
  )
}
