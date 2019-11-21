use crate::complete::base::skip;
use crate::complete::display::{parse_blend_mode, parse_filter_list};
use crate::complete::sound::parse_sound_info;
use crate::streaming::basic_data_types::{parse_color_transform_with_alpha, parse_matrix};
use nom::number::complete::{le_u16 as parse_le_u16, le_u8 as parse_u8};
use nom::IResult as NomResult;
use swf_types as swf;

#[derive(PartialEq, Eq, Clone, Copy, Ord, PartialOrd)]
pub enum ButtonVersion {
  Button1,
  Button2,
}

pub fn parse_button_record_string(input: &[u8], version: ButtonVersion) -> NomResult<&[u8], Vec<swf::ButtonRecord>> {
  let mut result: Vec<swf::ButtonRecord> = Vec::new();
  let mut current_input: &[u8] = input;
  loop {
    if current_input.is_empty() {
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

pub fn parse_button_record(input: &[u8], version: ButtonVersion) -> NomResult<&[u8], swf::ButtonRecord> {
  use nom::combinator::cond;

  let (input, flags) = parse_u8(input)?;
  #[allow(clippy::identity_op)]
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
    (input, swf::BlendMode::Normal)
  };

  Ok((
    input,
    swf::ButtonRecord {
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

pub fn parse_button2_cond_action_string(mut input: &[u8]) -> NomResult<&[u8], Vec<swf::ButtonCondAction>> {
  let mut actions: Vec<swf::ButtonCondAction> = Vec::new();
  loop {
    let (_, (next_action_offset, cond_action)) = parse_button2_cond_action(input)?;
    actions.push(cond_action);
    if next_action_offset == 0 {
      break;
    }
    let (next_input, ()) = skip(next_action_offset)(input)?;
    input = next_input;
  }
  Ok((input, actions))
}

pub fn parse_button2_cond_action(input: &[u8]) -> NomResult<&[u8], (usize, swf::ButtonCondAction)> {
  use nom::combinator::map;
  let (input, next_action_offset) = map(parse_le_u16, usize::from)(input)?;
  let (input, conditions) = parse_button_cond(input)?;
  let value = swf::ButtonCondAction {
    conditions: Some(conditions),
    actions: input.to_vec(),
  };
  Ok((input, (next_action_offset, value)))
}

pub fn parse_button_cond(input: &[u8]) -> NomResult<&[u8], swf::ButtonCond> {
  fn key_press_from_code(key_press_id: u16) -> Result<Option<u32>, ()> {
    match key_press_id {
      0 => Ok(None),
      k @ 1..=6 | k @ 8 | k @ 13..=19 | k @ 32..=126 => Ok(Some(u32::from(k))),
      _ => Err(()),
    }
  }

  let (input, flags) = parse_le_u16(input)?;
  #[allow(clippy::identity_op)]
  let idle_to_over_up = (flags & (1 << 0)) != 0;
  let over_up_to_idle = (flags & (1 << 1)) != 0;
  let over_up_to_over_down = (flags & (1 << 2)) != 0;
  let over_down_to_over_up = (flags & (1 << 3)) != 0;
  let over_down_to_out_down = (flags & (1 << 4)) != 0;
  let out_down_to_over_down = (flags & (1 << 5)) != 0;
  let out_down_to_idle = (flags & (1 << 6)) != 0;
  let idle_to_over_down = (flags & (1 << 7)) != 0;
  let over_down_to_idle = (flags & (1 << 8)) != 0;
  let key_press =
    key_press_from_code((flags >> 9) & 0x7f).map_err(|_| nom::Err::Error((input, nom::error::ErrorKind::Switch)))?;

  Ok((
    input,
    swf::ButtonCond {
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
    },
  ))
}

pub fn parse_button_sound(input: &[u8]) -> NomResult<&[u8], Option<swf::ButtonSound>> {
  let (input, sound_id) = parse_le_u16(input)?;
  if sound_id == 0 {
    Ok((input, None))
  } else {
    let (input, sound_info) = parse_sound_info(input)?;
    Ok((input, Some(swf::ButtonSound { sound_id, sound_info })))
  }
}
