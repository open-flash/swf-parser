use swf_tree as ast;
use nom::IResult;
use nom::{be_u16 as parse_be_u16, be_u32 as parse_be_u32, le_u8 as parse_u8, le_u32 as parse_le_u32};
use parsers::avm1::parse_actions_block;
use parsers::basic_data_types::{parse_le_fixed8_p8, parse_le_fixed16_p16, parse_straight_s_rgba8};

#[allow(unused_variables)]
pub fn parse_blend_mode(input: &[u8]) -> IResult<&[u8], ast::BlendMode> {
  switch!(input, parse_u8,
    0 => value!(ast::BlendMode::Normal) |
    1 => value!(ast::BlendMode::Normal) |
    2 => value!(ast::BlendMode::Layer) |
    3 => value!(ast::BlendMode::Multiply) |
    4 => value!(ast::BlendMode::Screen) |
    5 => value!(ast::BlendMode::Lighten) |
    6 => value!(ast::BlendMode::Darken) |
    7 => value!(ast::BlendMode::Difference) |
    8 => value!(ast::BlendMode::Add) |
    9 => value!(ast::BlendMode::Subtract) |
    10 => value!(ast::BlendMode::Invert) |
    11 => value!(ast::BlendMode::Alpha) |
    12 => value!(ast::BlendMode::Erase) |
    13 => value!(ast::BlendMode::Overlay) |
    14 => value!(ast::BlendMode::Hardlight)
    // TODO(demurgos): Error on unexpected value
  )
}

pub fn parse_clip_actions_string(input: &[u8], extended_events: bool) -> IResult<&[u8], Vec<ast::ClipAction>> {
  let mut result: Vec<ast::ClipAction> = Vec::new();
  let mut current_input = input;

  loop {
    let head = if extended_events {
      parse_be_u32(current_input)
    } else {
      map!(current_input, parse_be_u16, |x| x as u32)
    };

    match head {
      IResult::Done(next_input, event_flags) => {
        if event_flags == 0 {
          current_input = next_input;
          break;
        }
      }
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(n) => return IResult::Incomplete(n),
    };

    match parse_clip_actions(current_input, extended_events) {
      IResult::Done(next_input, clip_actions) => {
        result.push(clip_actions);
        current_input = next_input;
      }
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(n) => return IResult::Incomplete(n),
    };
  }

  IResult::Done(current_input, result)
}

#[allow(unused_variables)]
pub fn parse_clip_event_flags(input: &[u8], extended_events: bool) -> IResult<&[u8], ast::ClipEventFlags> {
  do_parse!(
    input,
    flags: switch!(value!(extended_events),
      true => call!(parse_be_u32) |
      false => map!(parse_be_u16, |x| (x as u32) << 16)
    ) >>
    (ast::ClipEventFlags {
      key_up: (flags & (1 << 31)) != 0,
      key_down: (flags & (1 << 30)) != 0,
      mouse_up: (flags & (1 << 29)) != 0,
      mouse_down: (flags & (1 << 28)) != 0,
      mouse_move: (flags & (1 << 27)) != 0,
      unload: (flags & (1 << 26)) != 0,
      enter_frame: (flags & (1 << 25)) != 0,
      load: (flags & (1 << 24)) != 0,
      drag_over: (flags & (1 << 23)) != 0,
      roll_out: (flags & (1 << 22)) != 0,
      roll_over: (flags & (1 << 21)) != 0,
      release_outside: (flags & (1 << 20)) != 0,
      release: (flags & (1 << 19)) != 0,
      press: (flags & (1 << 18)) != 0,
      initialize: (flags & (1 << 17)) != 0,
      data: (flags & (1 << 16)) != 0,
      construct: (flags & (1 << 10)) != 0,
      key_press: (flags & (1 << 9)) != 0,
      drag_out: (flags & (1 << 8)) != 0,
    })
  )
}

pub fn parse_clip_actions(input: &[u8], extended_events: bool) -> IResult<&[u8], ast::ClipAction> {
  do_parse!(
    input,
    events: apply!(parse_clip_event_flags, extended_events) >>
    actions_size: map!(parse_le_u32, |x| if events.key_press && x > 0 { x - 1 } else { x } as usize) >>
    key_code: cond!(events.key_press, parse_u8) >>
    actions: apply!(parse_actions_block, actions_size) >>
    (ast::ClipAction {
      events: events,
      key_code: key_code,
      actions: actions,
    })
  )
}

pub fn parse_filter_list(input: &[u8]) -> IResult<&[u8], Vec<ast::Filter>> {
  length_count!(input, parse_u8, parse_filter)
}

#[allow(unused_variables)]
pub fn parse_filter(input: &[u8]) -> IResult<&[u8], ast::Filter> {
  switch!(input, parse_u8,
//    0 => map!(parse_bevel_filter, |f| ast::Filter::Bevel(f)) |
//    1 => map!(parse_bevel_filter, |f| ast::Filter::Bevel(f)) |
//    2 => map!(parse_bevel_filter, |f| ast::Filter::Bevel(f)) |
    3 => map!(parse_bevel_filter, |f| ast::Filter::Bevel(f))
//    4 => map!(parse_bevel_filter, |f| ast::Filter::Bevel(f)) |
//    5 => map!(parse_bevel_filter, |f| ast::Filter::Bevel(f)) |
//    6 => map!(parse_bevel_filter, |f| ast::Filter::Bevel(f)) |
//    7 => map!(parse_bevel_filter, |f| ast::Filter::Bevel(f))
    // TODO(demurgos): Error on unexpected value
  )
}

#[allow(unused_variables)]
pub fn parse_bevel_filter(input: &[u8]) -> IResult<&[u8], ast::filters::Bevel> {
  do_parse!(
    input,
    shadow_color: parse_straight_s_rgba8 >>
    highlight_color: parse_straight_s_rgba8 >>
    blur_x: parse_le_fixed16_p16 >>
    blur_y: parse_le_fixed16_p16 >>
    angle: parse_le_fixed16_p16 >>
    distance: parse_le_fixed16_p16 >>
    strength: parse_le_fixed8_p8 >>
    flags: parse_u8 >>
    inner: value!((flags & (1 << 7)) != 0) >>
    knockout: value!((flags & (1 << 6)) != 0) >>
    composite_source: value!((flags & (1 << 5)) != 0) >>
    on_top: value!((flags & (1 << 4)) != 0) >>
    passes: value!(flags & ((1 << 4) - 1)) >>
    (ast::filters::Bevel {
      shadow_color: shadow_color,
      highlight_color: highlight_color,
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
    })
  )
}
