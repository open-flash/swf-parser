use nom::{IResult as NomResult, Needed};
use nom::{le_u16 as parse_le_u16, le_u8 as parse_u8};
use parsers::basic_data_types::{
  parse_bool_bits,
  parse_i32_bits,
  parse_le_fixed8_p8,
  parse_matrix,
  parse_s_rgb8,
  parse_straight_s_rgba8,
  parse_u16_bits,
  parse_u32_bits,
};
use parsers::gradient::parse_gradient;
use swf_tree as ast;

#[derive(PartialEq, Eq, Clone, Copy, Ord, PartialOrd)]
pub enum ShapeVersion {
  Shape1,
  Shape2,
  Shape3,
  Shape4,
}

pub fn parse_glyph(input: &[u8]) -> NomResult<&[u8], ast::Glyph> {
  bits!(input, parse_glyph_bits)
}

pub fn parse_glyph_bits(input: (&[u8], usize)) -> NomResult<(&[u8], usize), ast::Glyph> {
  do_parse!(
    input,
    fill_bits: map!(apply!(parse_u32_bits, 4), |x| x as usize) >>
    line_bits: map!(apply!(parse_u32_bits, 4), |x| x as usize) >>
    // TODO: Check which shape version to use
    records: apply!(parse_shape_record_string_bits, fill_bits, line_bits, ShapeVersion::Shape1) >>
    (ast::Glyph {
      records: records,
    })
  )
}

pub fn parse_shape(input: &[u8], version: ShapeVersion) -> NomResult<&[u8], ast::Shape> {
  bits!(input, apply!(parse_shape_bits, version))
}

pub fn parse_shape_bits(input: (&[u8], usize), version: ShapeVersion) -> NomResult<(&[u8], usize), ast::Shape> {
  do_parse!(
    input,
    styles: apply!(parse_shape_styles_bits, version) >>
    records: apply!(parse_shape_record_string_bits, styles.fill_bits, styles.line_bits, version) >>
    (ast::Shape {
      initial_styles: ast::ShapeStyles {
        fill: styles.fill,
        line: styles.line,
      },
      records: records,
    })
  )
}

// TODO: Rename to InternalShapeStyles or ParserShapeStyles
pub struct ShapeStyles {
  pub fill: Vec<ast::FillStyle>,
  pub line: Vec<ast::LineStyle>,
  pub fill_bits: usize,
  pub line_bits: usize,
}

pub fn parse_shape_styles_bits(input: (&[u8], usize), version: ShapeVersion) -> NomResult<(&[u8], usize), ShapeStyles> {
  do_parse!(
    input,
    fill: bytes!(apply!(parse_fill_style_list, version)) >>
    line: bytes!(apply!(parse_line_style_list, version)) >>
    fill_bits: map!(apply!(parse_u32_bits, 4), |x| x as usize) >>
    line_bits: map!(apply!(parse_u32_bits, 4), |x| x as usize) >>
    (ShapeStyles {
      fill: fill,
      line: line,
      fill_bits: fill_bits,
      line_bits: line_bits,
    })
  )
}

pub fn parse_shape_record_string_bits(input: (&[u8], usize), mut fill_bits: usize, mut line_bits: usize, version: ShapeVersion) -> NomResult<(&[u8], usize), Vec<ast::ShapeRecord>> {
  let mut result: Vec<ast::ShapeRecord> = Vec::new();
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
      if is_straight_edge {
        let (next_input, straight_edge) = parse_straight_edge_bits(current_input)?;
        current_input = next_input;
        result.push(ast::ShapeRecord::StraightEdge(straight_edge));
      } else {
        let (next_input, curved_edge) = parse_curved_edge_bits(current_input)?;
        current_input = next_input;
        result.push(ast::ShapeRecord::CurvedEdge(curved_edge));
      }
    } else {
      let (next_input, (style_change, style_bits)) = parse_style_change_bits(current_input, fill_bits, line_bits, version)?;
      fill_bits = style_bits.0;
      line_bits = style_bits.1;
      result.push(ast::ShapeRecord::StyleChange(style_change));
      current_input = next_input;
    }
  }

  Ok((current_input, result))
}

pub fn parse_curved_edge_bits(input: (&[u8], usize)) -> NomResult<(&[u8], usize), ast::shape_records::CurvedEdge> {
  do_parse!(
    input,
    n_bits: map!(apply!(parse_u16_bits, 4), |x| (x as usize) + 2) >>
    control_x: apply!(parse_i32_bits, n_bits) >>
    control_y: apply!(parse_i32_bits, n_bits) >>
    delta_x: apply!(parse_i32_bits, n_bits) >>
    delta_y: apply!(parse_i32_bits, n_bits) >>
    (ast::shape_records::CurvedEdge {
      control_delta: ast::Vector2D {x: control_x, y: control_y},
      anchor_delta: ast::Vector2D {x: delta_x, y: delta_y},
    })
  )
}

pub fn parse_straight_edge_bits(input: (&[u8], usize)) -> NomResult<(&[u8], usize), ast::shape_records::StraightEdge> {
  do_parse!(
    input,
    n_bits: map!(apply!(parse_u16_bits, 4), |x| (x as usize) + 2) >>
    is_diagonal: call!(parse_bool_bits) >>
    is_vertical: map!(cond!(!is_diagonal, call!(parse_bool_bits)), |opt: Option<bool>| opt.unwrap_or_default()) >>
    delta_x: cond!(is_diagonal || !is_vertical, apply!(parse_i32_bits, n_bits)) >>
    delta_y: cond!(is_diagonal || is_vertical, apply!(parse_i32_bits, n_bits)) >>
    (ast::shape_records::StraightEdge {
      delta: ast::Vector2D {x: delta_x.unwrap_or_default(), y: delta_y.unwrap_or_default()},
    })
  )
}

pub fn parse_style_change_bits(input: (&[u8], usize), fill_bits: usize, line_bits: usize, version: ShapeVersion) -> NomResult<(&[u8], usize), (ast::shape_records::StyleChange, (usize, usize))> {
  do_parse!(
    input,
    has_new_styles: parse_bool_bits >>
    change_line_style: parse_bool_bits >>
    change_right_fill: parse_bool_bits >>
    change_left_fill: parse_bool_bits >>
    has_move_to: parse_bool_bits >>
    move_to: cond!(has_move_to,
      do_parse!(
        move_to_bits: apply!(parse_u16_bits, 5) >>
        x: apply!(parse_i32_bits, move_to_bits as usize) >>
        y: apply!(parse_i32_bits, move_to_bits as usize) >>
        (ast::Vector2D {x: x, y: y})
      )
    ) >>
    left_fill: cond!(change_left_fill, apply!(parse_u16_bits, fill_bits)) >>
    right_fill: cond!(change_right_fill, apply!(parse_u16_bits, fill_bits)) >>
    line_style: cond!(change_line_style, apply!(parse_u16_bits, line_bits)) >>
    styles: map!(
      cond!(has_new_styles, apply!(parse_shape_styles_bits, version)),
      |styles| match styles {
        Option::Some(styles) => (
          Option::Some(ast::ShapeStyles {fill: styles.fill, line: styles.line}),
          styles.fill_bits,
          styles.line_bits,
        ),
        Option::None => (Option::None, fill_bits, line_bits),
      }
    ) >>
    ((
      ast::shape_records::StyleChange {
          move_to: move_to,
          left_fill: left_fill.map(|x| x as usize),
          right_fill: right_fill.map(|x| x as usize),
          line_style: line_style.map(|x| x as usize),
          new_styles: styles.0,
      },
      (styles.1, styles.2),
    ))
  )
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
  length_count!(input, apply!(parse_list_length, version >= ShapeVersion::Shape2), apply!(parse_fill_style, version >= ShapeVersion::Shape3))
}

pub fn parse_fill_style(input: &[u8], with_alpha: bool) -> NomResult<&[u8], ast::FillStyle> {
  switch!(input, parse_u8,
    0x00 => map!(apply!(parse_solid_fill, with_alpha), |fill| ast::FillStyle::Solid(fill)) |
    0x10 => map!(apply!(parse_linear_gradient_fill, with_alpha), |fill| ast::FillStyle::LinearGradient(fill)) |
    0x12 => map!(apply!(parse_radial_gradient_fill, with_alpha), |fill| ast::FillStyle::RadialGradient(fill)) |
    0x13 => map!(apply!(parse_focal_gradient_fill, with_alpha), |fill| ast::FillStyle::FocalGradient(fill)) |
    0x40 => map!(apply!(parse_bitmap_fill, true, true), |fill| ast::FillStyle::Bitmap(fill)) |
    0x41 => map!(apply!(parse_bitmap_fill, false, true), |fill| ast::FillStyle::Bitmap(fill)) |
    0x42 => map!(apply!(parse_bitmap_fill, true, false), |fill| ast::FillStyle::Bitmap(fill)) |
    0x43 => map!(apply!(parse_bitmap_fill, false, false), |fill| ast::FillStyle::Bitmap(fill))
    // TODO: Error
  )
}

pub fn parse_bitmap_fill(input: &[u8], repeating: bool, smoothed: bool) -> NomResult<&[u8], ast::fill_styles::Bitmap> {
  do_parse!(
    input,
    bitmap_id: parse_le_u16 >>
    matrix: parse_matrix >>
    (ast::fill_styles::Bitmap {
      bitmap_id: bitmap_id,
      matrix: matrix,
      repeating: repeating,
      smoothed: smoothed
    })
  )
}

pub fn parse_focal_gradient_fill(input: &[u8], with_alpha: bool) -> NomResult<&[u8], ast::fill_styles::FocalGradient> {
  do_parse!(
    input,
    matrix: parse_matrix >>
    gradient: apply!(parse_gradient, with_alpha) >>
    focal_point: parse_le_fixed8_p8 >>
    (ast::fill_styles::FocalGradient {
      matrix: matrix,
      gradient: gradient,
      focal_point: focal_point
    })
  )
}

pub fn parse_linear_gradient_fill(input: &[u8], with_alpha: bool) -> NomResult<&[u8], ast::fill_styles::LinearGradient> {
  do_parse!(
    input,
    matrix: parse_matrix >>
    gradient: apply!(parse_gradient, with_alpha) >>
    (ast::fill_styles::LinearGradient {
      matrix: matrix,
      gradient: gradient
    })
  )
}

pub fn parse_radial_gradient_fill(input: &[u8], with_alpha: bool) -> NomResult<&[u8], ast::fill_styles::RadialGradient> {
  do_parse!(
    input,
    matrix: parse_matrix >>
    gradient: apply!(parse_gradient, with_alpha) >>
    (ast::fill_styles::RadialGradient {
      matrix: matrix,
      gradient: gradient
    })
  )
}

pub fn parse_solid_fill(input: &[u8], with_alpha: bool) -> NomResult<&[u8], ast::fill_styles::Solid> {
  do_parse!(
    input,
    color: switch!(value!(with_alpha),
      true => call!(parse_straight_s_rgba8) |
      false => map!(parse_s_rgb8, |c| ast::StraightSRgba8 {r: c.r, g: c.g, b: c.b, a: 255})
    ) >>
    (ast::fill_styles::Solid {color: color})
  )
}

pub fn parse_line_style_list(input: &[u8], version: ShapeVersion) -> NomResult<&[u8], Vec<ast::LineStyle>> {
  length_count!(
    input,
    apply!(parse_list_length, version >= ShapeVersion::Shape2),
    switch!(value!(version >= ShapeVersion::Shape4),
      true => call!(parse_line_style2) |
      false => apply!(parse_line_style, version >= ShapeVersion::Shape3)
    )
  )
}

pub fn parse_line_style(input: &[u8], with_alpha: bool) -> NomResult<&[u8], ast::LineStyle> {
  do_parse!(
    input,
    width: parse_le_u16 >>
    color: switch!(value!(with_alpha),
      true => call!(parse_straight_s_rgba8) |
      false => map!(parse_s_rgb8, |c| ast::StraightSRgba8 {r: c.r, g: c.g, b: c.b, a: 255})
    ) >>
    (ast::LineStyle {
      width: width,
      start_cap: ast::CapStyle::Round,
      end_cap: ast::CapStyle::Round,
      join: ast::JoinStyle::Round,
      no_h_scale: false,
      no_v_scale: false,
      no_close: false,
      pixel_hinting: false,
      fill: ast::FillStyle::Solid(ast::fill_styles::Solid { color }),
    })
  )
}

pub fn parse_line_style2(input: &[u8]) -> NomResult<&[u8], ast::LineStyle> {
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
      true => apply!(parse_fill_style, true) |
      false => map!(parse_straight_s_rgba8, |color| ast::FillStyle::Solid(ast::fill_styles::Solid { color }))
    ) >>
    (ast::LineStyle {
      width: width,
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
