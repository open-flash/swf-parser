use crate::parsers::basic_data_types::{
  do_parse_u32_bits, parse_i32_bits, parse_le_f16, parse_rect, parse_s_rgb8, parse_straight_s_rgba8, parse_u32_bits,
};
use crate::parsers::shape::parse_glyph;
use nom::number::streaming::{
  le_i16 as parse_le_i16, le_u16 as parse_le_u16, le_u32 as parse_le_u32, le_u8 as parse_u8,
};
use nom::IResult as NomResult;
use std::convert::TryFrom;
use swf_tree as ast;

#[derive(PartialEq, Eq, Clone, Copy, Ord, PartialOrd)]
pub enum FontVersion {
  // `Font1` is handled apart as `DefineGlyphFont`.
  Font2,
  Font3,
  // `Font4` is handled apart as `DefineCffFont`.
}

#[derive(PartialEq, Eq, Clone, Copy, Ord, PartialOrd)]
pub enum TextVersion {
  Text1,
  Text2,
}

#[derive(PartialEq, Eq, Clone, Copy, Ord, PartialOrd)]
pub enum FontInfoVersion {
  FontInfo1,
  FontInfo2,
}

pub(crate) fn grid_fitting_from_code(grid_fitting_code: u8) -> ast::text::GridFitting {
  match grid_fitting_code {
    0 => ast::text::GridFitting::None,
    1 => ast::text::GridFitting::Pixel,
    2 => ast::text::GridFitting::SubPixel,
    _ => panic!("UnexpectedGridFittingCode: {}", grid_fitting_code),
  }
}

pub fn parse_csm_table_hint_bits(input: (&[u8], usize)) -> NomResult<(&[u8], usize), ast::text::CsmTableHint> {
  fn csm_table_hint_from_id(csm_table_hint_id: u32) -> ast::text::CsmTableHint {
    match csm_table_hint_id {
      0 => ast::text::CsmTableHint::Thin,
      1 => ast::text::CsmTableHint::Medium,
      2 => ast::text::CsmTableHint::Thick,
      _ => panic!("UnexpectedCsmTableHintId: {}", csm_table_hint_id),
    }
  }

  nom::combinator::map(|i| parse_u32_bits(i, 2), csm_table_hint_from_id)(input)
}

pub(crate) fn text_renderer_from_code(text_renderer_code: u8) -> ast::text::TextRenderer {
  match text_renderer_code {
    0 => ast::text::TextRenderer::Normal,
    1 => ast::text::TextRenderer::Advanced,
    _ => panic!("UnexpectedTextRendererCode: {}", text_renderer_code),
  }
}

pub fn parse_font_alignment_zone(input: &[u8]) -> NomResult<&[u8], ast::text::FontAlignmentZone> {
  use nom::combinator::map;
  use nom::multi::count;
  let (input, zone_count) = map(parse_u8, usize::from)(input)?;
  let (input, data) = count(parse_font_alignment_zone_data, zone_count)(input)?;
  let (input, flags) = parse_u8(input)?;
  Ok((
    input,
    ast::text::FontAlignmentZone {
      data,
      has_x: (flags & (1 << 0)) != 0,
      has_y: (flags & (1 << 1)) != 0,
    },
  ))
}

pub fn parse_font_alignment_zone_data(input: &[u8]) -> NomResult<&[u8], ast::text::FontAlignmentZoneData> {
  let (input, origin) = parse_le_f16(input)?;
  let (input, size) = parse_le_f16(input)?;
  Ok((input, ast::text::FontAlignmentZoneData { origin, size }))
}

pub fn parse_text_record_string(
  input: &[u8],
  has_alpha: bool,
  index_bits: usize,
  advance_bits: usize,
) -> NomResult<&[u8], Vec<ast::text::TextRecord>> {
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

pub fn parse_text_record(
  input: &[u8],
  has_alpha: bool,
  index_bits: usize,
  advance_bits: usize,
) -> NomResult<&[u8], ast::text::TextRecord> {
  use nom::bits::bits;
  use nom::combinator::{cond, map};

  let (input, flags) = parse_u8(input)?;
  let has_offset_x = (flags & (1 << 0)) != 0;
  let has_offset_y = (flags & (1 << 1)) != 0;
  let has_color = (flags & (1 << 2)) != 0;
  let has_font = (flags & (1 << 3)) != 0;
  // Skips bits [4, 7]
  let (input, font_id) = cond(has_font, parse_le_u16)(input)?;
  let (input, color) = if has_color {
    if has_alpha {
      map(parse_straight_s_rgba8, Some)(input)?
    } else {
      map(parse_s_rgb8, |c| {
        Some(ast::StraightSRgba8 {
          r: c.r,
          g: c.g,
          b: c.b,
          a: 255,
        })
      })(input)?
    }
  } else {
    (input, None)
  };
  let (input, offset_x) = cond(has_offset_x, parse_le_i16)(input)?;
  let (input, offset_y) = cond(has_offset_y, parse_le_i16)(input)?;
  let (input, font_size) = cond(has_font, parse_le_u16)(input)?;
  let (input, entry_count) = parse_u8(input)?;
  let (input, entries) = bits(|i| parse_glyph_entries(i, entry_count, index_bits, advance_bits))(input)?;

  Ok((
    input,
    ast::text::TextRecord {
      font_id,
      color,
      offset_x: offset_x.unwrap_or_default(),
      offset_y: offset_y.unwrap_or_default(),
      font_size,
      entries,
    },
  ))
}

pub fn parse_glyph_entries(
  input: (&[u8], usize),
  entry_count: u8,
  index_bits: usize,
  advance_bits: usize,
) -> NomResult<(&[u8], usize), Vec<ast::text::GlyphEntry>> {
  nom::multi::count(|i| parse_glyph_entry(i, index_bits, advance_bits), entry_count as usize)(input)
}

pub fn parse_glyph_entry(
  input: (&[u8], usize),
  index_bits: usize,
  advance_bits: usize,
) -> NomResult<(&[u8], usize), ast::text::GlyphEntry> {
  use nom::combinator::map;
  let (input, index) = map(do_parse_u32_bits(index_bits), |x| x as usize)(input)?;
  let (input, advance) = parse_i32_bits(input, advance_bits)?;

  Ok((input, ast::text::GlyphEntry { index, advance }))
}

pub fn parse_offset_glyphs(
  input: &[u8],
  glyph_count: usize,
  use_wide_offsets: bool,
) -> NomResult<&[u8], Vec<ast::Glyph>> {
  use nom::combinator::map;
  use nom::multi::count;

  let (offsets, end_offset) = if use_wide_offsets {
    let (input, offsets) = count(map(parse_le_u32, |x| usize::try_from(x).unwrap()), glyph_count)(input)?;
    let (_, end_offset) = map(parse_le_u32, |x| usize::try_from(x).unwrap())(input)?;
    (offsets, end_offset)
  } else {
    let (input, offsets) = count(map(parse_le_u16, usize::from), glyph_count)(input)?;
    let (_, end_offset) = map(parse_le_u16, usize::from)(input)?;
    (offsets, end_offset)
  };
  let mut glyphs: Vec<ast::Glyph> = Vec::with_capacity(glyph_count);
  for i in 0..glyph_count {
    let start_offset = offsets[i];
    let end_offset = if i + 1 < glyph_count {
      offsets[i + 1]
    } else {
      end_offset
    };
    match parse_glyph(&input[start_offset..end_offset]) {
      Ok((_, o)) => glyphs.push(o),
      Err(e) => return Err(e),
    };
  }
  Ok((&input[end_offset..], glyphs))
}

pub fn parse_kerning_record(input: &[u8]) -> NomResult<&[u8], ast::text::KerningRecord> {
  let (input, left) = parse_le_u16(input)?;
  let (input, right) = parse_le_u16(input)?;
  let (input, adjustment) = parse_le_i16(input)?;
  Ok((
    input,
    ast::text::KerningRecord {
      left,
      right,
      adjustment,
    },
  ))
}

pub fn parse_font_layout(input: &[u8], glyph_count: usize) -> NomResult<&[u8], ast::text::FontLayout> {
  use nom::combinator::map;
  use nom::multi::count;
  let (input, ascent) = parse_le_u16(input)?;
  let (input, descent) = parse_le_u16(input)?;
  let (input, leading) = parse_le_u16(input)?;
  let (input, advances) = count(parse_le_u16, glyph_count)(input)?;
  let (input, bounds) = count(parse_rect, glyph_count)(input)?;
  let (input, kerning) = {
    let (input, kerning_count) = map(parse_le_u16, usize::from)(input)?;
    count(parse_kerning_record, kerning_count)(input)?
  };
  Ok((
    input,
    ast::text::FontLayout {
      ascent: ascent,
      descent: descent,
      leading: leading,
      advances,
      bounds,
      kerning,
    },
  ))
}

pub fn parse_text_alignment(input: &[u8]) -> NomResult<&[u8], ast::text::TextAlignment> {
  let (input, code) = parse_u8(input)?;
  match code {
    0 => Ok((input, ast::text::TextAlignment::Left)),
    1 => Ok((input, ast::text::TextAlignment::Right)),
    2 => Ok((input, ast::text::TextAlignment::Center)),
    3 => Ok((input, ast::text::TextAlignment::Justify)),
    _ => Err(nom::Err::Error((input, nom::error::ErrorKind::Switch))),
  }
}
