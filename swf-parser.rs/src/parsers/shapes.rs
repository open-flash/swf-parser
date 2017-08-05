use swf_tree as ast;
use nom::{IResult, Needed};
use nom::{le_u8 as parse_u8, le_u16 as parse_le_u16};
use parsers::basic_data_types::{
  parse_bool_bits,
  parse_i32_bits,
  parse_u32_bits,
  parse_s_rgb8,
  parse_u16_bits
};

pub fn parse_glyph(input: &[u8]) -> IResult<&[u8], ast::Glyph> {
  bits!(input, parse_glyph_bits)
}

pub fn parse_glyph_bits(input: (&[u8], usize)) -> IResult<(&[u8], usize), ast::Glyph> {
  do_parse!(
    input,
    fill_bits: map!(apply!(parse_u32_bits, 4), |x| x as usize) >>
    line_bits: map!(apply!(parse_u32_bits, 4), |x| x as usize) >>
    records: apply!(parse_shape_record_string_bits, fill_bits, line_bits) >>
    (ast::Glyph {
      records: records,
    })
  )
}

pub fn parse_shape(input: &[u8]) -> IResult<&[u8], ast::Shape> {
  bits!(input, parse_shape_bits)
}

pub fn parse_shape_bits(input: (&[u8], usize)) -> IResult<(&[u8], usize), ast::Shape> {
  do_parse!(
    input,
    styles: parse_shape_styles_bits >>
    records: apply!(parse_shape_record_string_bits, styles.fill_bits, styles.line_bits) >>
    (ast::Shape {
      fill_styles: styles.fill,
      line_styles: styles.line,
      records: records,
    })
  )
}

pub struct ShapeStyles {
  pub fill: Vec<ast::FillStyle>,
  pub line: Vec<ast::LineStyle>,
  pub fill_bits: usize,
  pub line_bits: usize,
}

pub fn parse_shape_styles_bits(input: (&[u8], usize)) -> IResult<(&[u8], usize), ShapeStyles> {
  do_parse!(
    input,
    fill: bytes!(parse_fill_style_list) >>
    line: bytes!(parse_line_style_list) >>
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

pub fn parse_shape_record_string_bits(input: (&[u8], usize), mut fill_bits: usize, mut line_bits: usize) -> IResult<(&[u8], usize), Vec<ast::ShapeRecord>> {
  let mut result: Vec<ast::ShapeRecord> = Vec::new();
  let mut current_input = input;

  loop {
    match parse_u16_bits(current_input, 6) {
      IResult::Done(next_input, record_head) => if record_head == 0 {
        current_input = next_input;
        break
      },
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(_) => return IResult::Incomplete(Needed::Unknown),
    };

    let is_edge = match parse_bool_bits(current_input) {
      IResult::Done(next_input, is_edge) => {
        current_input = next_input;
        is_edge
      }
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(_) => return IResult::Incomplete(Needed::Unknown),
    };

    if is_edge {
      let is_straight_edge = match parse_bool_bits(current_input) {
        IResult::Done(next_input, is_straight_edge) => {
          current_input = next_input;
          is_straight_edge
        }
        IResult::Error(e) => return IResult::Error(e),
        IResult::Incomplete(_) => return IResult::Incomplete(Needed::Unknown),
      };
      if is_straight_edge {
        match parse_straight_edge_bits(current_input) {
          IResult::Done(next_input, straight_edge) => {
            let record = ast::ShapeRecord::StraightEdge(straight_edge);
            result.push(record);
            current_input = next_input;
          }
          IResult::Error(e) => return IResult::Error(e),
          IResult::Incomplete(n) => return IResult::Incomplete(n),
        };
      } else {
        match parse_curved_edge_bits(current_input) {
          IResult::Done(next_input, curved_edge) => {
            let record = ast::ShapeRecord::CurvedEdge(curved_edge);
            result.push(record);
            current_input = next_input;
          }
          IResult::Error(e) => return IResult::Error(e),
          IResult::Incomplete(n) => return IResult::Incomplete(n),
        };
      }
    } else {
      match parse_style_change_bits(current_input, fill_bits, line_bits) {
        IResult::Done(next_input, record_and_bits) => {
          let (style_change, style_bits) = record_and_bits;
          fill_bits = style_bits.0;
          line_bits = style_bits.1;
          let record = ast::ShapeRecord::StyleChange(style_change);
          result.push(record);
          current_input = next_input;
        }
        IResult::Error(e) => return IResult::Error(e),
        IResult::Incomplete(n) => return IResult::Incomplete(n),
      };
    }
  }

  IResult::Done(current_input, result)
}

pub fn parse_curved_edge_bits(input: (&[u8], usize)) -> IResult<(&[u8], usize), ast::shape_records::CurvedEdge> {
  do_parse!(
    input,
    n_bits: map!(apply!(parse_u16_bits, 4), |x| x as usize) >>
    control_x: apply!(parse_i32_bits, n_bits + 2) >>
    control_y: apply!(parse_i32_bits, n_bits + 2) >>
    delta_x: apply!(parse_i32_bits, n_bits + 2) >>
    delta_y: apply!(parse_i32_bits, n_bits + 2) >>
    (ast::shape_records::CurvedEdge {
      control_delta: ast::Vector2D {x: control_x, y: control_y},
      end_delta: ast::Vector2D {x: delta_x, y: delta_y},
    })
  )
}

pub fn parse_straight_edge_bits(input: (&[u8], usize)) -> IResult<(&[u8], usize), ast::shape_records::StraightEdge> {
  do_parse!(
    input,
    n_bits: map!(apply!(parse_u16_bits, 4), |x| x as usize) >>
    is_diagonal: call!(parse_bool_bits) >>
    is_vertical: map!(cond!(!is_diagonal, call!(parse_bool_bits)), |opt: Option<bool>| opt.unwrap_or_default()) >>
    delta_x: cond!(is_diagonal || !is_vertical, apply!(parse_i32_bits, n_bits + 2)) >>
    delta_y: cond!(is_diagonal || is_vertical, apply!(parse_i32_bits, n_bits + 2)) >>
    (ast::shape_records::StraightEdge {
      end_delta: ast::Vector2D {x: delta_x.unwrap_or_default(), y: delta_y.unwrap_or_default()},
    })
  )
}

pub fn parse_style_change_bits(input: (&[u8], usize), fill_bits: usize, line_bits: usize) -> IResult<(&[u8], usize), (ast::shape_records::StyleChange, (usize, usize))> {
  do_parse!(
    input,
    has_new_styles: parse_bool_bits >>
    change_line_style: call!(parse_bool_bits) >>
    change_right_fill: call!(parse_bool_bits) >>
    change_left_fill: call!(parse_bool_bits) >>
    has_move_to: call!(parse_bool_bits) >>
    move_to: cond!(has_move_to,
      do_parse!(
        move_to_bits: apply!(parse_u16_bits, 5) >>
        delta_x: apply!(parse_i32_bits, move_to_bits as usize) >>
        delta_y: apply!(parse_i32_bits, move_to_bits as usize) >>
        (delta_x, delta_y)
      )
    ) >>
    left_fill: cond!(change_left_fill, apply!(parse_u16_bits, fill_bits)) >>
    right_fill: cond!(change_right_fill, apply!(parse_u16_bits, fill_bits)) >>
    line_style: cond!(change_line_style, apply!(parse_u16_bits, line_bits)) >>
    styles: map!(
      cond!(has_new_styles, parse_shape_styles_bits),
      |styles| match styles {
        Option::Some(styles) => (Option::Some(styles.fill), Option::Some(styles.line), styles.fill_bits, styles.line_bits),
        Option::None => (Option::None, Option::None, fill_bits, line_bits),
      }
    ) >>
    ((
      ast::shape_records::StyleChange {
          move_to: move_to.map(|vector| ast::Vector2D {x: vector.0, y: vector.1}),
          left_fill: left_fill.map(|x| x as usize),
          right_fill: right_fill.map(|x| x as usize),
          line_style: line_style.map(|x| x as usize),
          fill_styles: styles.0,
          line_styles: styles.1,
      },
      (styles.2, styles.3),
    ))
  )
}

pub fn parse_list_length(input: &[u8]) -> IResult<&[u8], usize> {
  match parse_u8(input) {
    IResult::Done(remaining_input, u8_len) => {
      if u8_len < 0xff {
        IResult::Done(remaining_input, u8_len as usize)
      } else {
        parse_le_u16(remaining_input)
          .map(|u16_len| u16_len as usize)
      }
    }
    IResult::Error(e) => IResult::Error(e),
    IResult::Incomplete(n) => IResult::Incomplete(n),
  }
}

pub fn parse_line_style(input: &[u8]) -> IResult<&[u8], ast::LineStyle> {
  do_parse!(
    input,
    width: parse_le_u16 >>
    color: parse_s_rgb8 >>
    (
      ast::LineStyle {
      width: width,
      start_cap: ast::CapStyle::Round,
      end_cap: ast::CapStyle::Round,
      join: ast::JoinStyle::Round,
      no_h_scale: false,
      no_v_scale: false,
      no_close: false,
      pixel_hinting: false,
      fill: ast::FillStyle::Solid(
        ast::fill_styles::Solid {
          color: ast::StraightSRgba8 {
            r: color.r,
            g: color.g,
            b: color.b,
            a: 255
          }
        }
      ),
    })
  )
}

pub fn parse_line_style_list(input: &[u8]) -> IResult<&[u8], Vec<ast::LineStyle>> {
  length_count!(input, parse_list_length, parse_line_style)
}

pub fn parse_solid_fill(input: &[u8]) -> IResult<&[u8], ast::fill_styles::Solid> {
  do_parse!(
    input,
    color: parse_s_rgb8 >>
    (
      ast::fill_styles::Solid {
        color: ast::StraightSRgba8 {
          r: color.r,
          g: color.g,
          b: color.b,
          a: 255
        }
    })
  )
}

#[allow(unused_variables)]
pub fn parse_fill_style(input: &[u8]) -> IResult<&[u8], ast::FillStyle> {
  switch!(input, parse_u8,
   0x00 => map!(parse_solid_fill, |fill| ast::FillStyle::Solid(fill))
  )
}

pub fn parse_fill_style_list(input: &[u8]) -> IResult<&[u8], Vec<ast::FillStyle>> {
  length_count!(input, parse_list_length, parse_fill_style)
}
