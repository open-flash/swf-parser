use crate::complete::tag::parse_tag_body;
use crate::state::ParseState;
use nom::number::streaming::{le_u16 as parse_le_u16, le_u32 as parse_le_u32};
use nom::{IResult as NomResult, Needed};
use swf_tree as ast;

pub(crate) fn parse_tag<'a>(input: &'a [u8], state: &ParseState) -> NomResult<&'a [u8], ast::Tag> {
  use std::convert::TryInto;

  match parse_tag_header(input) {
    Ok((remaining_input, rh)) => {
      let tag_length: usize = rh.length.try_into().unwrap();
      if remaining_input.len() < tag_length {
        let record_header_length = input.len() - remaining_input.len();
        Err(::nom::Err::Incomplete(Needed::Size(record_header_length + tag_length)))
      } else {
        let record_data: &[u8] = &remaining_input[..tag_length];
        let remaining_input: &[u8] = &remaining_input[tag_length..];
        let record_result = parse_tag_body(record_data, rh.code, state);
        match record_result {
          Ok((_, output_tag)) => {
            match output_tag {
              ast::Tag::DefineFont(ref tag) => {
                match tag.glyphs {
                  Some(ref glyphs) => state.set_glyph_count(tag.id as usize, glyphs.len()),
                  None => state.set_glyph_count(tag.id as usize, 0),
                };
              }
              _ => (),
            };
            Ok((remaining_input, output_tag))
          }
          Err(e) => Err(e),
        }
      }
    }
    Err(e) => Err(e),
  }
}

pub(crate) fn parse_tag_header(input: &[u8]) -> NomResult<&[u8], ast::TagHeader> {
  use nom::combinator::map;

  let (input, code_and_length) = parse_le_u16(input)?;
  let code = code_and_length >> 6;
  let max_length = (1 << 6) - 1;
  let length = code_and_length & max_length;
  if length < max_length {
    // TODO: Check if it should be a `<=` instead?
    Ok((
      input,
      ast::TagHeader {
        code,
        length: length.into(),
      },
    ))
  } else {
    map(parse_le_u32, |length| ast::TagHeader { code, length })(input)
  }
}
