use crate::complete::tag::parse_tag_body;
use crate::state::ParseState;
use nom::number::streaming::{le_u16 as parse_le_u16, le_u32 as parse_le_u32};
use nom::IResult as NomResult;
use std::convert::TryFrom;
use swf_tree as ast;

/// Represents an error caused by incomplete input.
#[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum StreamingTagError {
  /// Indicates that the input is not long enough to read the tag header.
  ///
  /// A header is either `2` or `6` bytes long.
  /// Parsing with an input of 6 bytes or more guarantees that this error
  /// will not occur.
  IncompleteHeader,

  /// Indicates that the input is not long enough to read the full tag
  /// (header and body).
  ///
  /// The value indicates the full length of the tag. Parsing with an input at
  /// least (or exactly) this long guarantees that the tag will be parsed.
  IncompleteTag(usize),
}

/// Parses the tag at the start of the (possibly incomplete) input.
///
/// The minimum length of `input` for a tag is `2`.
/// In case of success, returns the remaining input and `Tag`.
/// In case of error, returns the original input and error description.
pub(crate) fn parse_tag<'a>(
  input: &'a [u8],
  state: &ParseState,
) -> Result<(&'a [u8], ast::Tag), (&'a [u8], StreamingTagError)> {
  let base_input = input; // Keep original input for errors.
  let (input, header) = match parse_tag_header(input) {
    Ok(ok) => ok,
    Err(_) => return Err((base_input, StreamingTagError::IncompleteHeader)),
  };
  let body_len = usize::try_from(header.length).unwrap();
  if input.len() < body_len {
    let header_len = base_input.len() - input.len();
    let tag_len = header_len + body_len;
    return Err((base_input, StreamingTagError::IncompleteTag(tag_len)));
  }
  let (input, tag_body) = (&input[body_len..], &input[..body_len]);
  let tag = parse_tag_body(tag_body, header.code, state);
  if let ast::Tag::DefineFont(ref tag) = &tag {
    match tag.glyphs {
      Some(ref glyphs) => state.set_glyph_count(tag.id as usize, glyphs.len()),
      None => state.set_glyph_count(tag.id as usize, 0),
    }
  }
  Ok((input, tag))
}

pub(crate) fn parse_tag_header(input: &[u8]) -> NomResult<&[u8], ast::TagHeader> {
  let (input, code_and_length) = parse_le_u16(input)?;
  let code = code_and_length >> 6;
  let max_length = (1 << 6) - 1;
  let length = code_and_length & max_length;
  let (input, length) = if length < max_length {
    (input, u32::from(length))
  } else {
    debug_assert_eq!(length, max_length);
    parse_le_u32(input)?
  };

  Ok((input, ast::TagHeader { code, length }))
}
