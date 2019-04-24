use swf_tree as ast;
use nom::IResult;
use nom::{le_i16 as parse_le_i16, le_u8 as parse_u8, le_u16 as parse_le_u16, le_u32 as parse_le_u32};
use crate::parsers::basic_data_types::{
  parse_rect,
  parse_le_f16,
  parse_s_rgb8,
  parse_straight_s_rgba8,
  parse_i32_bits,
  parse_u32_bits,
};
use crate::parsers::shape::parse_glyph;

pub fn parse_grid_fitting_bits(input: (&[u8], usize)) -> IResult<(&[u8], usize), ast::text::GridFitting> {
  switch!(
    input,
    apply!(parse_u32_bits, 3),
    0 => value!(ast::text::GridFitting::None) |
    1 => value!(ast::text::GridFitting::Pixel) |
    2 => value!(ast::text::GridFitting::SubPixel)
    // TODO(demurgos): Throw error
  )
}

pub fn parse_csm_table_hint_bits(input: (&[u8], usize)) -> IResult<(&[u8], usize), ast::text::CsmTableHint> {
  switch!(
    input,
    apply!(parse_u32_bits, 2),
    0 => value!(ast::text::CsmTableHint::Thin) |
    1 => value!(ast::text::CsmTableHint::Medium) |
    2 => value!(ast::text::CsmTableHint::Thick)
    // TODO(demurgos): Throw error
  )
}

pub fn parse_text_renderer_bits(input: (&[u8], usize)) -> IResult<(&[u8], usize), ast::text::TextRenderer> {
  switch!(
    input,
    apply!(parse_u32_bits, 2),
    0 => value!(ast::text::TextRenderer::Normal) |
    1 => value!(ast::text::TextRenderer::Advanced)
    // TODO(demurgos): Throw error
  )
}

pub fn parse_font_alignment_zone(input: &[u8]) -> IResult<&[u8], ast::text::FontAlignmentZone> {
  do_parse!(
    input,
    data: length_count!(parse_u8, parse_font_alignment_zone_data) >>
    flags: parse_u8 >>
    (ast::text::FontAlignmentZone {
      data: data,
      has_x: (flags & (1 << 0)) != 0,
      has_y: (flags & (1 << 1)) != 0
    })
  )
}

pub fn parse_font_alignment_zone_data(input: &[u8]) -> IResult<&[u8], ast::text::FontAlignmentZoneData> {
  do_parse!(
    input,
    origin: parse_le_f16 >>
    size: parse_le_f16 >>
    (ast::text::FontAlignmentZoneData {
      origin,
      size,
    })
  )
}

pub fn parse_text_record_string(input: &[u8], has_alpha: bool, index_bits: usize, advance_bits: usize) -> IResult<&[u8], Vec<ast::text::TextRecord>> {
  let mut result: Vec<ast::text::TextRecord> = Vec::new();
  let mut current_input: &[u8] = input;
  while current_input.len() > 0 {
    // A null byte indicates the end of the string of actions
    if current_input[0] == 0 {
      current_input = &current_input[1..];
      return Ok((current_input, result));
    }
    match parse_text_record(current_input, has_alpha, index_bits, advance_bits) {
      Ok((next_input, text_record)) => {
        current_input = next_input;
        result.push(text_record);
      }
      Err(::nom::Err::Incomplete(_)) => return Err(::nom::Err::Incomplete(::nom::Needed::Unknown)),
      Err(e) => return Err(e),
    };
  }
  Err(::nom::Err::Incomplete(::nom::Needed::Unknown))
}

pub fn parse_text_record(input: &[u8], has_alpha: bool, index_bits: usize, advance_bits: usize) -> IResult<&[u8], ast::text::TextRecord> {
  do_parse!(
    input,
    flags: parse_u8 >>
    has_offset_x: value!((flags & (1 << 0)) !=  0) >>
    has_offset_y: value!((flags & (1 << 1)) != 0) >>
    has_color: value!((flags & (1 << 2)) != 0) >>
    has_font: value!((flags & (1 << 3)) != 0) >>
    // Skips bits [4, 7]
    font_id: cond!(has_font, parse_le_u16) >>
    color: cond!(has_color, switch!(value!(has_alpha),
      true => call!(parse_straight_s_rgba8) |
      false => map!(parse_s_rgb8, |c| ast::StraightSRgba8 {r: c.r, g: c.g, b: c.b, a: 255})
    )) >>
    offset_x: cond!(has_offset_x, parse_le_i16) >>
    offset_y: cond!(has_offset_y, parse_le_i16) >>
    font_size: cond!(has_font, parse_le_u16) >>
    entry_count: parse_u8 >>
    entries: bits!(apply!(parse_glyph_entries, entry_count, index_bits, advance_bits)) >>
    (ast::text::TextRecord {
      font_id: font_id,
      color: color,
      offset_x: offset_x.unwrap_or_default(),
      offset_y: offset_y.unwrap_or_default(),
      font_size: font_size,
      entries: entries,
    })
  )
}

pub fn parse_glyph_entries(input: (&[u8], usize), entry_count: u8, index_bits: usize, advance_bits: usize) -> IResult<(&[u8], usize), Vec<ast::text::GlyphEntry>> {
  length_count!(input,
    value!(entry_count),
    apply!(parse_glyph_entry, index_bits, advance_bits)
  )
}

pub fn parse_glyph_entry(input: (&[u8], usize), index_bits: usize, advance_bits: usize) -> IResult<(&[u8], usize), ast::text::GlyphEntry> {
  do_parse!(
    input,
    index: map!(apply!(parse_u32_bits, index_bits), |x| x as usize) >>
    advance: apply!(parse_i32_bits, advance_bits) >>
    (ast::text::GlyphEntry {
      index: index,
      advance: advance,
    })
  )
}

pub fn parse_offset_glyphs(input: &[u8], glyph_count: usize, use_wide_offsets: bool) -> IResult<&[u8], Vec<ast::Glyph>> {
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
    Ok((_, o)) => o,
    Err(e) => return Err(e),
  };
  let mut glyphs: Vec<ast::Glyph> = Vec::with_capacity(glyph_count);
  for i in 0..glyph_count {
    let start_offset = offsets[i];
    let end_offset = if i + 1 < glyph_count { offsets[i + 1] } else { end_offset };
    match parse_glyph(&input[start_offset..end_offset]) {
      Ok((_, o)) => glyphs.push(o),
      Err(e) => return Err(e),
    };
  }
  value!(&input[end_offset..], glyphs)
}

pub fn parse_kerning_record(input: &[u8]) -> IResult<&[u8], ast::text::KerningRecord> {
  do_parse!(
    input,
    left: parse_le_u16 >>
    right: parse_le_u16 >>
    adjustment: parse_le_i16 >>
    (ast::text::KerningRecord {
      left: left,
      right: right,
      adjustment: adjustment,
    })
  )
}

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

pub fn parse_text_alignment(input: &[u8]) -> IResult<&[u8], ast::text::TextAlignment> {
  switch!(
    input,
    parse_u8,
    0 => value!(ast::text::TextAlignment::Left) |
    1 => value!(ast::text::TextAlignment::Right) |
    2 => value!(ast::text::TextAlignment::Center) |
    3 => value!(ast::text::TextAlignment::Justify)
    // TODO(demurgos): Throw error
  )
}
