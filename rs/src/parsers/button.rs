use crate::parsers::basic_data_types::{parse_color_transform_with_alpha, parse_matrix};
use crate::parsers::display::{parse_blend_mode, parse_filter_list};
use nom::number::streaming::{le_u16 as parse_le_u16, le_u8 as parse_u8};
use nom::IResult as NomResult;
use swf_tree as ast;

#[derive(PartialEq, Eq, Clone, Copy, Ord, PartialOrd)]
pub enum ButtonVersion {
  Button1,
  Button2,
}

pub fn parse_button_record_string(input: &[u8], version: ButtonVersion) -> NomResult<&[u8], Vec<ast::ButtonRecord>> {
  let mut result: Vec<ast::ButtonRecord> = Vec::new();
  let mut current_input: &[u8] = input;
  loop {
    if current_input.len() == 0 {
      return Err(::nom::Err::Incomplete(::nom::Needed::Unknown));
    }
    if current_input[0] == 0 {
      // End of string
      current_input = &current_input[1..];
      break;
    }
    match parse_button_record(current_input, version) {
      Ok((next_input, button_record)) => {
        current_input = next_input;
        result.push(button_record);
      }
      Err(::nom::Err::Incomplete(_)) => return Err(::nom::Err::Incomplete(::nom::Needed::Unknown)),
      Err(e) => return Err(e),
    };
  }
  Ok((current_input, result))
}

pub fn parse_button_record(input: &[u8], version: ButtonVersion) -> NomResult<&[u8], ast::ButtonRecord> {
  use nom::combinator::cond;

  let (input, flags) = parse_u8(input)?;
  let state_up = (flags & (1 << 0)) != 0;
  let state_over = (flags & (1 << 1)) != 0;
  let state_down = (flags & (1 << 2)) != 0;
  let state_hit_test = (flags & (1 << 3)) != 0;
  let has_filter_list = (flags & (1 << 4)) != 0;
  let has_blend_mode = (flags & (1 << 5)) != 0;
  // (Skip bits [6, 7])
  let (input, character_id) = parse_le_u16(input)?;
  let (input, depth) = parse_le_u16(input)?;
  let (input, matrix) = parse_matrix(input)?;
  let (input, color_transform) = cond(version >= ButtonVersion::Button2, parse_color_transform_with_alpha)(input)?;
  let (input, filters) = if version >= ButtonVersion::Button2 && has_filter_list {
    parse_filter_list(input)?
  } else {
    (input, Vec::new())
  };
  let (input, blend_mode) = if version >= ButtonVersion::Button2 && has_blend_mode {
    parse_blend_mode(input)?
  } else {
    (input, ast::BlendMode::Normal)
  };

  Ok((
    input,
    ast::ButtonRecord {
      state_up,
      state_over,
      state_down,
      state_hit_test,
      character_id,
      depth,
      matrix,
      color_transform,
      filters,
      blend_mode,
    },
  ))
}

pub fn parse_button2_cond_action_string(input: &[u8]) -> NomResult<&[u8], Vec<ast::ButtonCondAction>> {
  let mut result: Vec<ast::ButtonCondAction> = Vec::new();
  let mut current_input: &[u8] = input;
  loop {
    let (input, next_action_offset) = parse_le_u16(current_input)?;

    let (input, next_input) = if next_action_offset == 0 {
      (input, &[] as &[u8])
    } else {
      let next_action_offset = next_action_offset as usize;
      let le_u16_size = current_input.len() - input.len();
      (
        &current_input[le_u16_size..next_action_offset],
        &current_input[next_action_offset..],
      )
    };

    match parse_button2_cond_action(input) {
      Ok((_, cond_action)) => {
        current_input = next_input;
        result.push(cond_action);
      }
      Err(::nom::Err::Incomplete(_)) => return Err(::nom::Err::Incomplete(::nom::Needed::Unknown)),
      Err(e) => return Err(e),
    };
    if next_action_offset == 0 {
      break;
    }
  }
  Ok((current_input, result))
}

pub fn parse_button2_cond_action(input: &[u8]) -> NomResult<&[u8], ast::ButtonCondAction> {
  let (input, conditions) = parse_button_cond(input)?;
  let value = ast::ButtonCondAction {
    conditions: Some(conditions),
    actions: input.to_vec(),
  };
  Ok((&[][..], value))
}

pub fn parse_button_cond(input: &[u8]) -> NomResult<&[u8], ast::ButtonCond> {
  fn key_press_from_id(key_press_id: u16) -> Option<u32> {
    match key_press_id {
      0 => Option::None,
      k @ 1..=6 | k @ 8 | k @ 13..=19 | k @ 32..=126 => Some(k as u32),
      _ => panic!("InvalidKeyCode: {}", key_press_id),
    }
  }

  do_parse!(
    input,
    flags: parse_le_u16
      >> idle_to_over_up: value!((flags & (1 << 0)) != 0)
      >> over_up_to_idle: value!((flags & (1 << 1)) != 0)
      >> over_up_to_over_down: value!((flags & (1 << 2)) != 0)
      >> over_down_to_over_up: value!((flags & (1 << 3)) != 0)
      >> over_down_to_out_down: value!((flags & (1 << 4)) != 0)
      >> out_down_to_over_down: value!((flags & (1 << 5)) != 0)
      >> out_down_to_idle: value!((flags & (1 << 6)) != 0)
      >> idle_to_over_down: value!((flags & (1 << 7)) != 0)
      >> over_down_to_idle: value!((flags & (1 << 8)) != 0)
      >> key_press: map!(value!((flags >> 9) & 0x7f), key_press_from_id)
      >> (ast::ButtonCond {
        key_press,
        over_down_to_idle,
        idle_to_over_up,
        over_up_to_idle,
        over_up_to_over_down,
        over_down_to_over_up,
        over_down_to_out_down,
        out_down_to_over_down,
        out_down_to_idle,
        idle_to_over_down,
      })
  )
}
