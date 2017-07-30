use swf_tree as ast;
use nom::{IResult};
use nom::{le_i16 as parse_le_i16, le_u16 as parse_le_u16, le_u32 as parse_le_u32};
use parsers::basic_data_types::{
  parse_rect,
};
use parsers::shapes::parse_glyph;

pub fn parse_offset_glyphs(input: &[u8], glyph_count: usize, use_wide_offsets: bool) -> IResult<&[u8], Vec<ast::shapes::Glyph>> {
  let parsed_offsets = if use_wide_offsets {
    pair!(
      input,
      length_count!(value!(glyph_count), map!(parse_le_u32, |x| x as usize)),
      map!(parse_le_u32, |x| x as usize)
    )
  } else {
    pair!(
      input,
      length_count!(value!(glyph_count), map!(parse_le_u16, |x| x as usize)),
      map!(parse_le_u16, |x| x as usize)
    )
  };
  let (offsets, end_offset) = match parsed_offsets {
    IResult::Done(_, o) => o,
    IResult::Error(e) => return IResult::Error(e),
    IResult::Incomplete(n) => return IResult::Incomplete(n),
  };
  let mut glyphs: Vec<ast::shapes::Glyph> = Vec::with_capacity(glyph_count);
  for i in 0..glyph_count {
    let start_offset = offsets[i];
    let end_offset = if i + 1 < glyph_count { offsets[i + 1] } else { end_offset };
    match parse_glyph(&input[start_offset..end_offset]) {
      IResult::Done(_, o) => glyphs.push(o),
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(n) => return IResult::Incomplete(n),
    };
  }
  value!(&input[end_offset..], glyphs)
}

named!(
  pub parse_kerning_record<ast::text::KerningRecord>,
  do_parse!(
    left: parse_le_u16 >>
    right: parse_le_u16 >>
    adjustment: parse_le_i16 >>
    (ast::text::KerningRecord {
      left: left,
      right: right,
      adjustment: adjustment,
    })
  )
);

pub fn parse_font_layout(input: &[u8], glyph_count: usize) -> IResult<&[u8], ast::text::FontLayout> {
  do_parse!(input,
    ascent: parse_le_u16 >>
    descent: parse_le_u16 >>
    leading: parse_le_u16 >>
    advances: length_count!(value!(glyph_count), parse_le_u16) >>
    bounds: length_count!(value!(glyph_count), parse_rect) >>
    kerning: length_count!(parse_le_u16, parse_kerning_record) >>
    (ast::text::FontLayout {
      ascent: ascent,
      descent: descent,
      leading: leading,
      advances,
      bounds,
      kerning,
    })
  )
}

