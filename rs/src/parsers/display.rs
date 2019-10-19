use crate::parsers::basic_data_types::{parse_le_fixed16_p16, parse_le_fixed8_p8, parse_straight_s_rgba8};
use nom::number::streaming::{
  le_f32 as parse_le_f32, le_u16 as parse_le_u16, le_u32 as parse_le_u32, le_u8 as parse_u8,
};
use nom::IResult as NomResult;
use swf_tree as ast;

#[allow(unused_variables)]
pub fn parse_blend_mode(input: &[u8]) -> NomResult<&[u8], ast::BlendMode> {
  let (input, code) = parse_u8(input)?;
  let blend_mode: ast::BlendMode = match code {
    0 => ast::BlendMode::Normal,
    1 => ast::BlendMode::Normal,
    2 => ast::BlendMode::Layer,
    3 => ast::BlendMode::Multiply,
    4 => ast::BlendMode::Screen,
    5 => ast::BlendMode::Lighten,
    6 => ast::BlendMode::Darken,
    7 => ast::BlendMode::Difference,
    8 => ast::BlendMode::Add,
    9 => ast::BlendMode::Subtract,
    10 => ast::BlendMode::Invert,
    11 => ast::BlendMode::Alpha,
    12 => ast::BlendMode::Erase,
    13 => ast::BlendMode::Overlay,
    14 => ast::BlendMode::Hardlight,
    _ => return Err(nom::Err::Error((input, nom::error::ErrorKind::Switch))),
  };
  Ok((input, blend_mode))
}

pub fn parse_clip_actions_string(input: &[u8], extended_events: bool) -> NomResult<&[u8], Vec<ast::ClipAction>> {
  use nom::combinator::map;

  let input = &input[2..]; // Skip `reserved`
  let input = &input[(if extended_events { 4 } else { 2 })..]; // Skip `all_events`

  let mut result: Vec<ast::ClipAction> = Vec::new();
  let mut current_input = input;

  loop {
    let head = if extended_events {
      parse_le_u32(current_input)
    } else {
      map(parse_le_u16, u32::from)(current_input)
    };

    match head {
      Ok((next_input, event_flags)) => {
        if event_flags == 0 {
          current_input = next_input;
          break;
        }
      }
      Err(e) => return Err(e),
    };

    match parse_clip_actions(current_input, extended_events) {
      Ok((next_input, clip_actions)) => {
        result.push(clip_actions);
        current_input = next_input;
      }
      Err(e) => return Err(e),
    };
  }

  Ok((current_input, result))
}

#[allow(unused_variables)]
pub fn parse_clip_event_flags(input: &[u8], extended_events: bool) -> NomResult<&[u8], ast::ClipEventFlags> {
  use nom::combinator::map;

  let (input, flags) = if extended_events {
    parse_le_u32(input)?
  } else {
    map(parse_le_u16, u32::from)(input)?
  };

  Ok((
    input,
    ast::ClipEventFlags {
      load: (flags & (1 << 0)) != 0,
      enter_frame: (flags & (1 << 1)) != 0,
      unload: (flags & (1 << 2)) != 0,
      mouse_move: (flags & (1 << 3)) != 0,
      mouse_down: (flags & (1 << 4)) != 0,
      mouse_up: (flags & (1 << 5)) != 0,
      key_down: (flags & (1 << 6)) != 0,
      key_up: (flags & (1 << 7)) != 0,
      data: (flags & (1 << 8)) != 0,
      initialize: (flags & (1 << 9)) != 0,
      press: (flags & (1 << 10)) != 0,
      release: (flags & (1 << 11)) != 0,
      release_outside: (flags & (1 << 12)) != 0,
      roll_over: (flags & (1 << 13)) != 0,
      roll_out: (flags & (1 << 14)) != 0,
      drag_over: (flags & (1 << 15)) != 0,
      drag_out: (flags & (1 << 16)) != 0,
      key_press: (flags & (1 << 17)) != 0,
      construct: (flags & (1 << 18)) != 0,
    },
  ))
}

pub fn parse_clip_actions(input: &[u8], extended_events: bool) -> NomResult<&[u8], ast::ClipAction> {
  use nom::combinator::map;

  let (input, events) = parse_clip_event_flags(input, extended_events)?;
  let (input, actions_size) = map(parse_le_u32, |x| x as usize)(input)?;
  let (input, (actions_size, key_code)) = if events.key_press {
    let (input, key_code) = parse_u8(input)?;
    (input, (actions_size.saturating_sub(1), Some(key_code)))
  } else {
    (input, (actions_size, None))
  };
  let (input, actions) = nom::bytes::streaming::take(actions_size)(input)?;

  Ok((
    input,
    ast::ClipAction {
      events,
      key_code,
      actions: actions.to_vec(),
    },
  ))
}

pub fn parse_filter_list(input: &[u8]) -> NomResult<&[u8], Vec<ast::Filter>> {
  use nom::multi::count;
  let (input, filter_count) = parse_u8(input)?;
  count(parse_filter, usize::from(filter_count))(input)
}

#[allow(unused_variables)]
pub fn parse_filter(input: &[u8]) -> NomResult<&[u8], ast::Filter> {
  use nom::combinator::map;
  let (input, code) = parse_u8(input)?;
  match code {
    0 => map(parse_drop_shadow_filter, ast::Filter::DropShadow)(input),
    1 => map(parse_blur_filter, ast::Filter::Blur)(input),
    2 => map(parse_glow_filter, ast::Filter::Glow)(input),
    3 => map(parse_bevel_filter, ast::Filter::Bevel)(input),
    4 => map(parse_gradient_glow_filter, ast::Filter::GradientGlow)(input),
    5 => map(parse_convolution_filter, ast::Filter::Convolution)(input),
    6 => map(parse_color_matrix_filter, ast::Filter::ColorMatrix)(input),
    7 => map(parse_gradient_bevel_filter, ast::Filter::GradientBevel)(input),
    _ => return Err(nom::Err::Error((input, nom::error::ErrorKind::Switch))),
  }
}

pub fn parse_bevel_filter(input: &[u8]) -> NomResult<&[u8], ast::filters::Bevel> {
  let (input, shadow_color) = parse_straight_s_rgba8(input)?;
  let (input, highlight_color) = parse_straight_s_rgba8(input)?;
  let (input, blur_x) = parse_le_fixed16_p16(input)?;
  let (input, blur_y) = parse_le_fixed16_p16(input)?;
  let (input, angle) = parse_le_fixed16_p16(input)?;
  let (input, distance) = parse_le_fixed16_p16(input)?;
  let (input, strength) = parse_le_fixed8_p8(input)?;
  let (input, flags) = parse_u8(input)?;
  let passes = flags & 0b1111;
  let on_top = (flags & (1 << 4)) != 0;
  let composite_source = (flags & (1 << 5)) != 0;
  let knockout = (flags & (1 << 6)) != 0;
  let inner = (flags & (1 << 7)) != 0;

  Ok((
    input,
    ast::filters::Bevel {
      shadow_color,
      highlight_color,
      blur_x,
      blur_y,
      angle,
      distance,
      strength,
      inner,
      knockout,
      composite_source,
      on_top,
      passes,
    },
  ))
}

pub fn parse_blur_filter(input: &[u8]) -> NomResult<&[u8], ast::filters::Blur> {
  let (input, blur_x) = parse_le_fixed16_p16(input)?;
  let (input, blur_y) = parse_le_fixed16_p16(input)?;
  let (input, flags) = parse_u8(input)?;
  // Skip bits [0, 2]
  let passes = flags >> 3;

  Ok((input, ast::filters::Blur { blur_x, blur_y, passes }))
}

pub fn parse_color_matrix_filter(mut input: &[u8]) -> NomResult<&[u8], ast::filters::ColorMatrix> {
  let mut matrix: [f32; 20] = [0f32; 20];
  for i in 0..matrix.len() {
    let (next_input, value) = parse_le_f32(input)?;
    input = next_input;
    matrix[i] = value;
  }
  Ok((input, ast::filters::ColorMatrix { matrix }))
}

pub fn parse_convolution_filter(input: &[u8]) -> NomResult<&[u8], ast::filters::Convolution> {
  use nom::combinator::map;
  use nom::multi::count;

  let (input, matrix_width) = map(parse_u8, usize::from)(input)?;
  let (input, matrix_height) = map(parse_u8, usize::from)(input)?;
  let (input, divisor) = parse_le_f32(input)?;
  let (input, bias) = parse_le_f32(input)?;
  let (input, matrix) = count(parse_le_f32, matrix_width * matrix_height)(input)?;
  let (input, default_color) = parse_straight_s_rgba8(input)?;
  let (input, flags) = parse_u8(input)?;
  let preserve_alpha = (flags & (1 << 0)) != 0;
  let clamp = (flags & (1 << 1)) != 0;
  // Skip bits [2, 7]

  Ok((
    input,
    ast::filters::Convolution {
      matrix_width,
      matrix_height,
      divisor,
      bias,
      matrix,
      default_color,
      clamp,
      preserve_alpha,
    },
  ))
}

pub fn parse_drop_shadow_filter(input: &[u8]) -> NomResult<&[u8], ast::filters::DropShadow> {
  let (input, color) = parse_straight_s_rgba8(input)?;
  let (input, blur_x) = parse_le_fixed16_p16(input)?;
  let (input, blur_y) = parse_le_fixed16_p16(input)?;
  let (input, angle) = parse_le_fixed16_p16(input)?;
  let (input, distance) = parse_le_fixed16_p16(input)?;
  let (input, strength) = parse_le_fixed8_p8(input)?;
  let (input, flags) = parse_u8(input)?;
  let passes = flags & ((1 << 5) - 1);
  let composite_source = (flags & (1 << 5)) != 0;
  let knockout = (flags & (1 << 6)) != 0;
  let inner = (flags & (1 << 7)) != 0;

  Ok((
    input,
    ast::filters::DropShadow {
      color,
      blur_x,
      blur_y,
      angle,
      distance,
      strength,
      inner,
      knockout,
      composite_source,
      passes,
    },
  ))
}

pub fn parse_glow_filter(input: &[u8]) -> NomResult<&[u8], ast::filters::Glow> {
  let (input, color) = parse_straight_s_rgba8(input)?;
  let (input, blur_x) = parse_le_fixed16_p16(input)?;
  let (input, blur_y) = parse_le_fixed16_p16(input)?;
  let (input, strength) = parse_le_fixed8_p8(input)?;
  let (input, flags) = parse_u8(input)?;
  let passes = flags & ((1 << 5) - 1);
  let composite_source = (flags & (1 << 5)) != 0;
  let knockout = (flags & (1 << 6)) != 0;
  let inner = (flags & (1 << 7)) != 0;

  Ok((
    input,
    ast::filters::Glow {
      color,
      blur_x,
      blur_y,
      strength,
      inner,
      knockout,
      composite_source,
      passes,
    },
  ))
}

fn parse_filter_gradient(input: &[u8], color_count: usize) -> NomResult<&[u8], Vec<ast::ColorStop>> {
  let mut result: Vec<ast::ColorStop> = Vec::with_capacity(color_count);
  let mut current_input = input;

  for _ in 0..color_count {
    match parse_straight_s_rgba8(current_input) {
      Ok((next_input, color)) => {
        result.push(ast::ColorStop { ratio: 0, color: color });
        current_input = next_input;
      }
      Err(e) => return Err(e),
    };
  }
  for mut color_stop in &mut result {
    match parse_u8(current_input) {
      Ok((next_input, ratio)) => {
        color_stop.ratio = ratio;
        current_input = next_input;
      }
      Err(e) => return Err(e),
    };
  }
  Ok((current_input, result))
}

pub fn parse_gradient_bevel_filter(input: &[u8]) -> NomResult<&[u8], ast::filters::GradientBevel> {
  use nom::combinator::map;

  let (input, color_count) = map(parse_u8, |x| x as usize)(input)?;
  let (input, gradient) = parse_filter_gradient(input, color_count)?;
  let (input, blur_x) = parse_le_fixed16_p16(input)?;
  let (input, blur_y) = parse_le_fixed16_p16(input)?;
  let (input, angle) = parse_le_fixed16_p16(input)?;
  let (input, distance) = parse_le_fixed16_p16(input)?;
  let (input, strength) = parse_le_fixed8_p8(input)?;

  let (input, flags) = parse_u8(input)?;
  let passes = flags & ((1 << 4) - 1);
  let on_top = (flags & (1 << 4)) != 0;
  let composite_source = (flags & (1 << 5)) != 0;
  let knockout = (flags & (1 << 6)) != 0;
  let inner = (flags & (1 << 7)) != 0;

  Ok((
    input,
    ast::filters::GradientBevel {
      gradient,
      blur_x,
      blur_y,
      angle,
      distance,
      strength,
      inner,
      knockout,
      composite_source,
      on_top,
      passes,
    },
  ))
}

pub fn parse_gradient_glow_filter(input: &[u8]) -> NomResult<&[u8], ast::filters::GradientGlow> {
  use nom::combinator::map;

  let (input, color_count) = map(parse_u8, |x| x as usize)(input)?;
  let (input, gradient) = parse_filter_gradient(input, color_count)?;
  let (input, blur_x) = parse_le_fixed16_p16(input)?;
  let (input, blur_y) = parse_le_fixed16_p16(input)?;
  let (input, angle) = parse_le_fixed16_p16(input)?;
  let (input, distance) = parse_le_fixed16_p16(input)?;
  let (input, strength) = parse_le_fixed8_p8(input)?;

  let (input, flags) = parse_u8(input)?;
  let passes = flags & ((1 << 4) - 1);
  let on_top = (flags & (1 << 4)) != 0;
  let composite_source = (flags & (1 << 5)) != 0;
  let knockout = (flags & (1 << 6)) != 0;
  let inner = (flags & (1 << 7)) != 0;

  Ok((
    input,
    ast::filters::GradientGlow {
      gradient: gradient,
      blur_x: blur_x,
      blur_y: blur_y,
      angle: angle,
      distance: distance,
      strength: strength,
      inner: inner,
      knockout: knockout,
      composite_source: composite_source,
      on_top: on_top,
      passes: passes,
    },
  ))
}
