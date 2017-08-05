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

named!(
  pub parse_clip_event_flags<ast::ClipEventFlags>,
  bits!(parse_clip_event_flags_bits)
);

named!(
  pub parse_clip_event_flags_bits<(&[u8], usize), ast::ClipEventFlags>,
  do_parse!(
    key_up: call!(parse_bool_bits) >>
    key_down: call!(parse_bool_bits) >>
    mouse_up: call!(parse_bool_bits) >>
    mouse_down: call!(parse_bool_bits) >>
    unload: call!(parse_bool_bits) >>
    enter_frane: call!(parse_bool_bits) >>
    load: call!(parse_bool_bits) >>
    drag_over: call!(parse_bool_bits) >>
    roll_out: call!(parse_bool_bits) >>
    roll_over: call!(parse_bool_bits) >>
    release_outside: call!(parse_bool_bits) >>
    release: call!(parse_bool_bits) >>
    press: call!(parse_bool_bits) >>
    initialize: call!(parse_bool_bits) >>
    data: call!(parse_bool_bits) >>
    construct: call!(parse_bool_bits) >>
    key_press: call!(parse_bool_bits) >>
    drag_out: call!(parse_bool_bits) >>
    (ast::ClipEventFlags {
      key_up: key_up,
      key_down: key_down,
      mouse_up: mouse_up,
      mouse_down: mouse_down,
      unload: unload,
      enter_frane: enter_frane,
      load: load,
      drag_over: drag_over,
      roll_out: roll_out,
      roll_over: roll_over,
      release_outside: release_outside,
      release: release,
      press: press,
      initialize: initialize,
      data: data,
      construct: construct,
      key_press: key_press,
      drag_out: drag_out,
    })
  )
);

named!(
  pub parse_clip_action<ast::ClipAction>,
  do_parse!(
    events: parse_clip_event_flags >>
    key_code: cond!(events.key_press, parse_u8) >>
    (ast::ClipAction {
      events: events,
      key_code: key_code,
      // TODO (size-1 if key_press, see spec and TS)
      actions: vec!(),
    })
  )
);
