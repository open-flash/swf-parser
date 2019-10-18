use nom::number::streaming::{
  le_f32 as parse_le_f32, le_i16 as parse_le_i16, le_u16 as parse_le_u16, le_u32 as parse_le_u32, le_u8 as parse_u8,
};
use nom::{IResult, Needed};
use std::convert::TryFrom;
use swf_tree as ast;
use swf_tree::{ButtonCondAction, Glyph};

use crate::parsers::basic_data_types::{
  parse_block_c_string, parse_c_string, parse_color_transform, parse_color_transform_with_alpha, parse_language_code,
  parse_leb128_u32, parse_matrix, parse_named_id, parse_rect, parse_s_rgb8, parse_straight_s_rgba8,
};
use crate::parsers::button::{
  parse_button2_cond_action_string, parse_button_record_string, parse_button_sound, ButtonVersion,
};
use crate::parsers::display::{parse_blend_mode, parse_clip_actions_string, parse_filter_list};
use crate::parsers::image::get_gif_image_dimensions;
use crate::parsers::image::get_png_image_dimensions;
use crate::parsers::image::GIF_START;
use crate::parsers::image::PNG_START;
use crate::parsers::image::{get_jpeg_image_dimensions, test_image_start, ERRONEOUS_JPEG_START, JPEG_START};
use crate::parsers::morph_shape::{parse_morph_shape, MorphShapeVersion};
use crate::parsers::movie::parse_tag_block_string;
use crate::parsers::shape::{parse_glyph, parse_shape, ShapeVersion};
use crate::parsers::sound::{
  audio_coding_format_from_id, is_uncompressed_audio_coding_format, parse_sound_info, sound_rate_from_id,
};
use crate::parsers::text::{
  grid_fitting_from_code, parse_csm_table_hint_bits, parse_font_alignment_zone, parse_font_layout, parse_offset_glyphs,
  parse_text_alignment, parse_text_record_string, text_renderer_from_code, FontInfoVersion, FontVersion, TextVersion,
};
use crate::parsers::video::{parse_videoc_codec, video_deblocking_from_id};
use crate::state::ParseState;

fn parse_tag_header(input: &[u8]) -> IResult<&[u8], ast::TagHeader> {
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

pub fn parse_tag<'a>(input: &'a [u8], state: &ParseState) -> IResult<&'a [u8], ast::Tag> {
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

fn parse_tag_body<'a>(input: &'a [u8], code: u16, state: &ParseState) -> IResult<&'a [u8], ast::Tag> {
  use nom::combinator::map;
  match code {
    1 => Ok((input, ast::Tag::ShowFrame)),
    2 => map(parse_define_shape, ast::Tag::DefineShape)(input),
    4 => map(parse_place_object, ast::Tag::PlaceObject)(input),
    5 => map(parse_remove_object, ast::Tag::RemoveObject)(input),
    6 => map(
      |i| parse_define_bits(i, state.get_swf_version()),
      ast::Tag::DefineBitmap,
    )(input),
    7 => map(parse_define_button, ast::Tag::DefineButton)(input),
    8 => map(
      |i| parse_define_jpeg_tables(i, state.get_swf_version()),
      ast::Tag::DefineJpegTables,
    )(input),
    9 => map(parse_set_background_color_tag, ast::Tag::SetBackgroundColor)(input),
    10 => map(parse_define_font, ast::Tag::DefineGlyphFont)(input),
    11 => map(parse_define_text, ast::Tag::DefineText)(input),
    12 => map(parse_do_action, ast::Tag::DoAction)(input),
    13 => map(parse_define_font_info, ast::Tag::DefineFontInfo)(input),
    14 => map(parse_define_sound, ast::Tag::DefineSound)(input),
    15 => map(parse_start_sound, ast::Tag::StartSound)(input),
    17 => map(parse_define_button_sound, ast::Tag::DefineButtonSound)(input),
    18 => map(parse_sound_stream_head, ast::Tag::SoundStreamHead)(input),
    19 => map(parse_sound_stream_block, ast::Tag::SoundStreamBlock)(input),
    20 => map(parse_define_bits_lossless, ast::Tag::DefineBitmap)(input),
    21 => map(
      |i| parse_define_bits_jpeg2(i, state.get_swf_version()),
      ast::Tag::DefineBitmap,
    )(input),
    22 => map(parse_define_shape2, ast::Tag::DefineShape)(input),
    23 => map(
      parse_define_button_color_transform,
      ast::Tag::DefineButtonColorTransform,
    )(input),
    24 => map(parse_protect, ast::Tag::Protect)(input),
    25 => Ok((input, ast::Tag::EnablePostscript)),
    26 => map(
      |i| parse_place_object2(i, state.get_swf_version() >= 6),
      ast::Tag::PlaceObject,
    )(input),
    28 => map(parse_remove_object2, ast::Tag::RemoveObject)(input),
    32 => map(parse_define_shape3, ast::Tag::DefineShape)(input),
    33 => map(parse_define_text2, ast::Tag::DefineText)(input),
    34 => map(parse_define_button2, ast::Tag::DefineButton)(input),
    35 => map(
      |i| parse_define_bits_jpeg3(i, state.get_swf_version()),
      ast::Tag::DefineBitmap,
    )(input),
    36 => map(parse_define_bits_lossless2, ast::Tag::DefineBitmap)(input),
    37 => map(parse_define_edit_text, ast::Tag::DefineDynamicText)(input),
    39 => map(|i| parse_define_sprite(i, state), ast::Tag::DefineSprite)(input),
    43 => map(parse_frame_label, ast::Tag::FrameLabel)(input),
    45 => map(parse_sound_stream_head2, ast::Tag::SoundStreamHead)(input),
    46 => map(parse_define_morph_shape, ast::Tag::DefineMorphShape)(input),
    48 => map(parse_define_font2, ast::Tag::DefineFont)(input),
    56 => map(parse_export_assets, ast::Tag::ExportAssets)(input),
    57 => map(parse_import_assets, ast::Tag::ImportAssets)(input),
    58 => map(parse_enable_debugger, ast::Tag::EnableDebugger)(input),
    59 => map(parse_do_init_action, ast::Tag::DoInitAction)(input),
    60 => map(parse_define_video_stream, ast::Tag::DefineVideoStream)(input),
    61 => map(parse_video_frame, ast::Tag::VideoFrame)(input),
    62 => map(parse_define_font_info2, ast::Tag::DefineFontInfo)(input),
    64 => map(parse_enable_debugger2, ast::Tag::EnableDebugger)(input),
    65 => map(parse_script_limits, ast::Tag::ScriptLimits)(input),
    66 => map(parse_set_tab_index, ast::Tag::SetTabIndex)(input),
    69 => map(parse_file_attributes_tag, ast::Tag::FileAttributes)(input),
    70 => map(
      |i| parse_place_object3(i, state.get_swf_version() >= 6),
      ast::Tag::PlaceObject,
    )(input),
    71 => map(parse_import_assets2, ast::Tag::ImportAssets)(input),
    73 => map(
      |i| parse_define_font_align_zones(i, |font_id| state.get_glyph_count(font_id)),
      ast::Tag::DefineFontAlignZones,
    )(input),
    74 => map(parse_csm_text_settings, ast::Tag::CsmTextSettings)(input),
    75 => map(parse_define_font3, ast::Tag::DefineFont)(input),
    76 => map(parse_symbol_class, ast::Tag::SymbolClass)(input),
    77 => map(parse_metadata, ast::Tag::Metadata)(input),
    78 => map(parse_define_scaling_grid, ast::Tag::DefineScalingGrid)(input),
    82 => map(parse_do_abc, ast::Tag::DoAbc)(input),
    83 => map(parse_define_shape4, ast::Tag::DefineShape)(input),
    84 => map(parse_define_morph_shape2, ast::Tag::DefineMorphShape)(input),
    86 => map(
      parse_define_scene_and_frame_label_data_tag,
      ast::Tag::DefineSceneAndFrameLabelData,
    )(input),
    87 => map(parse_define_binary_data, ast::Tag::DefineBinaryData)(input),
    88 => map(parse_define_font_name, ast::Tag::DefineFontName)(input),
    89 => map(parse_start_sound2, ast::Tag::StartSound2)(input),
    90 => map(parse_define_bits_jpeg4, ast::Tag::DefineBitmap)(input),
    91 => map(parse_define_font4, ast::Tag::DefineCffFont)(input),
    93 => map(parse_enable_telemetry, ast::Tag::Telemetry)(input),
    _ => map(parse_bytes, |data| ast::Tag::Unknown(ast::tags::Unknown { code, data }))(input),
  }
}

pub fn parse_csm_text_settings(input: &[u8]) -> IResult<&[u8], ast::tags::CsmTextSettings> {
  let (input, text_id) = parse_le_u16(input)?;
  let (input, flags) = parse_u8(input)?;
  // Skip bits [0, 2]
  let fitting = grid_fitting_from_code((flags >> 3) & 0b111);
  let renderer = text_renderer_from_code((flags >> 6) & 0b11);
  let (input, thickness) = parse_le_f32(input)?;
  let (input, sharpness) = parse_le_f32(input)?;
  // TODO: Skip 1 byte / assert 1 byte is available
  Ok((
    input,
    ast::tags::CsmTextSettings {
      text_id,
      renderer,
      fitting,
      thickness,
      sharpness,
    },
  ))
}

pub fn parse_define_binary_data(input: &[u8]) -> IResult<&[u8], ast::tags::DefineBinaryData> {
  let (input, id) = parse_le_u16(input)?;
  let (input, _reserved) = parse_le_u32(input)?; // TODO: assert reserved == 0
  let data = input.to_vec();
  let input = &[][..];
  Ok((input, ast::tags::DefineBinaryData { id, data }))
}

pub fn parse_define_bits(input: &[u8], swf_version: u8) -> IResult<&[u8], ast::tags::DefineBitmap> {
  let (input, id) = parse_le_u16(input)?;
  let data: Vec<u8> = input.to_vec();
  let input: &[u8] = &[][..];

  if test_image_start(&data, &JPEG_START) || (swf_version < 8 && test_image_start(&data, &ERRONEOUS_JPEG_START)) {
    let image_dimensions = get_jpeg_image_dimensions(&data).unwrap();
    // TODO: avoid conversions
    Ok((
      input,
      ast::tags::DefineBitmap {
        id,
        width: image_dimensions.width as u16,
        height: image_dimensions.height as u16,
        media_type: ast::ImageType::PartialJpeg,
        data,
      },
    ))
  } else {
    panic!("UnknownBitmapType");
  }
}

pub fn parse_define_button(input: &[u8]) -> IResult<&[u8], ast::tags::DefineButton> {
  let (input, id) = parse_le_u16(input)?;

  let (input, characters) = parse_button_record_string(input, ButtonVersion::Button1)?;
  let actions = input.to_vec();
  let cond_action = ButtonCondAction {
    conditions: None,
    actions,
  };

  Ok((
    input,
    ast::tags::DefineButton {
      id,
      track_as_menu: false,
      characters,
      actions: vec![cond_action],
    },
  ))
}

pub fn parse_define_button2(input: &[u8]) -> IResult<&[u8], ast::tags::DefineButton> {
  use nom::combinator::map;

  let (input, id) = parse_le_u16(input)?;
  let (input, flags) = parse_u8(input)?;
  let track_as_menu = (flags & (1 << 0)) != 0;
  // Skip bits [1, 7]
  // TODO: Assert action offset matches
  let (input, action_offset) = map(parse_le_u16, |x| x as usize)(input)?;
  let (input, characters) = parse_button_record_string(input, ButtonVersion::Button2)?;
  let (input, actions) = if action_offset != 0 {
    parse_button2_cond_action_string(input)?
  } else {
    (input, Vec::new())
  };

  Ok((
    input,
    ast::tags::DefineButton {
      id,
      track_as_menu,
      characters,
      actions,
    },
  ))
}

pub fn parse_define_button_color_transform(input: &[u8]) -> IResult<&[u8], ast::tags::DefineButtonColorTransform> {
  let (input, button_id) = parse_le_u16(input)?;
  let (input, transform) = parse_color_transform(input)?;

  Ok((input, ast::tags::DefineButtonColorTransform { button_id, transform }))
}

pub fn parse_define_button_sound(input: &[u8]) -> IResult<&[u8], ast::tags::DefineButtonSound> {
  let (input, button_id) = parse_le_u16(input)?;
  let (input, over_up_to_idle) = parse_button_sound(input)?;
  let (input, idle_to_over_up) = parse_button_sound(input)?;
  let (input, over_up_to_over_down) = parse_button_sound(input)?;
  let (input, over_down_to_over_up) = parse_button_sound(input)?;

  Ok((
    input,
    ast::tags::DefineButtonSound {
      button_id,
      over_up_to_idle,
      idle_to_over_up,
      over_up_to_over_down,
      over_down_to_over_up,
    },
  ))
}

pub fn parse_define_bits_jpeg2(input: &[u8], swf_version: u8) -> IResult<&[u8], ast::tags::DefineBitmap> {
  let (input, id) = parse_le_u16(input)?;
  let data: Vec<u8> = input.to_vec();
  let input: &[u8] = &[][..];

  let (media_type, dimensions) =
    if test_image_start(&data, &JPEG_START) || (swf_version < 8 && test_image_start(&data, &ERRONEOUS_JPEG_START)) {
      (ast::ImageType::Jpeg, get_jpeg_image_dimensions(&data).unwrap())
    } else if test_image_start(&data, &PNG_START) {
      (ast::ImageType::Png, get_png_image_dimensions(&data).unwrap())
    } else if test_image_start(&data, &GIF_START) {
      (ast::ImageType::Gif, get_gif_image_dimensions(&data).unwrap())
    } else {
      panic!("UnknownBitmapType");
    };

  Ok((
    input,
    ast::tags::DefineBitmap {
      id,
      width: dimensions.width as u16,
      height: dimensions.height as u16,
      media_type,
      data,
    },
  ))
}

pub fn parse_define_bits_jpeg3(input: &[u8], swf_version: u8) -> IResult<&[u8], ast::tags::DefineBitmap> {
  let (ajpeg_data, id) = parse_le_u16(input)?;
  let (input, data_len) = parse_le_u32(ajpeg_data).map(|(i, dl)| (i, dl as usize))?;
  let data = &input[..data_len];

  let (media_type, dimensions, data) =
    if test_image_start(data, &JPEG_START) || (swf_version < 8 && test_image_start(data, &ERRONEOUS_JPEG_START)) {
      let dimensions = get_jpeg_image_dimensions(&input[..data_len]).unwrap();
      if input.len() > data_len {
        (ast::ImageType::Ajpeg, dimensions, ajpeg_data.to_vec())
      } else {
        (ast::ImageType::Jpeg, dimensions, data.to_vec())
      }
    } else if test_image_start(data, &PNG_START) {
      (
        ast::ImageType::Png,
        get_png_image_dimensions(data).unwrap(),
        data.to_vec(),
      )
    } else if test_image_start(data, &GIF_START) {
      (
        ast::ImageType::Gif,
        get_gif_image_dimensions(data).unwrap(),
        data.to_vec(),
      )
    } else {
      panic!("UnknownBitmapType");
    };

  let input: &[u8] = &[][..];

  Ok((
    input,
    ast::tags::DefineBitmap {
      id,
      width: dimensions.width as u16,
      height: dimensions.height as u16,
      media_type,
      data,
    },
  ))
}

pub fn parse_define_bits_jpeg4(input: &[u8]) -> IResult<&[u8], ast::tags::DefineBitmap> {
  use nom::bytes::complete::take;
  use nom::combinator::map;

  let (djpeg_data, id) = parse_le_u16(input)?;
  let (input, data_len) = map(parse_le_u32, |dl| usize::try_from(dl).unwrap())(djpeg_data)?;
  let (input, _) = take(2usize)(input)?; // Skip deblock
  let data = &input[..data_len];

  let (media_type, dimensions, data) = if test_image_start(data, &JPEG_START) {
    let dimensions = get_jpeg_image_dimensions(&input[..data_len]).unwrap();
    (ast::ImageType::Ajpegd, dimensions, djpeg_data.to_vec())
  } else if test_image_start(data, &PNG_START) {
    (
      ast::ImageType::Png,
      get_png_image_dimensions(data).unwrap(),
      data.to_vec(),
    )
  } else if test_image_start(data, &GIF_START) {
    (
      ast::ImageType::Gif,
      get_gif_image_dimensions(data).unwrap(),
      data.to_vec(),
    )
  } else {
    panic!("UnknownBitmapType");
  };

  let input: &[u8] = &[][..];

  Ok((
    input,
    ast::tags::DefineBitmap {
      id,
      width: dimensions.width as u16,
      height: dimensions.height as u16,
      media_type,
      data,
    },
  ))
}

pub fn parse_define_bits_lossless(input: &[u8]) -> IResult<&[u8], ast::tags::DefineBitmap> {
  parse_define_bits_lossless_any(input, ast::ImageType::SwfBmp)
}

pub fn parse_define_bits_lossless2(input: &[u8]) -> IResult<&[u8], ast::tags::DefineBitmap> {
  parse_define_bits_lossless_any(input, ast::ImageType::SwfAbmp)
}

fn parse_define_bits_lossless_any(input: &[u8], media_type: ast::ImageType) -> IResult<&[u8], ast::tags::DefineBitmap> {
  let (input, id) = parse_le_u16(input)?;
  let data: Vec<u8> = input.to_vec();
  let input = &input[1..]; // BitmapFormat
  let (input, width) = parse_le_u16(input)?;
  let (_, height) = parse_le_u16(input)?;
  let input: &[u8] = &[][..];

  Ok((
    input,
    ast::tags::DefineBitmap {
      id,
      width,
      height,
      media_type,
      data,
    },
  ))
}

pub fn parse_define_edit_text(input: &[u8]) -> IResult<&[u8], ast::tags::DefineDynamicText> {
  use nom::combinator::cond;
  use nom::combinator::map;

  let (input, id) = parse_le_u16(input)?;
  let (input, bounds) = parse_rect(input)?;
  let (input, flags) = parse_le_u16(input)?;
  let has_font = (flags & (1 << 0)) != 0;
  let has_max_length = (flags & (1 << 1)) != 0;
  let has_color = (flags & (1 << 2)) != 0;
  let readonly = (flags & (1 << 3)) != 0;
  let password = (flags & (1 << 4)) != 0;
  let multiline = (flags & (1 << 5)) != 0;
  let word_wrap = (flags & (1 << 6)) != 0;
  let has_text = (flags & (1 << 7)) != 0;
  let use_glyph_font = (flags & (1 << 8)) != 0;
  let html = (flags & (1 << 9)) != 0;
  let was_static = (flags & (1 << 10)) != 0;
  let border = (flags & (1 << 11)) != 0;
  let no_select = (flags & (1 << 12)) != 0;
  let has_layout = (flags & (1 << 13)) != 0;
  let auto_size = (flags & (1 << 14)) != 0;
  let has_font_class = (flags & (1 << 15)) != 0;

  let (input, font_id) = cond(has_font, parse_le_u16)(input)?;
  let (input, font_class) = cond(has_font_class, parse_c_string)(input)?;
  let (input, font_size) = cond(has_font, parse_le_u16)(input)?;
  let (input, color) = cond(has_color, parse_straight_s_rgba8)(input)?;
  let (input, max_length) = cond(has_max_length, map(parse_le_u16, usize::from))(input)?;
  let (input, align, margin_left, margin_right, indent, leading) = if has_layout {
    let (input, align) = parse_text_alignment(input)?;
    let (input, margin_left) = parse_le_u16(input)?;
    let (input, margin_right) = parse_le_u16(input)?;
    let (input, indent) = parse_le_u16(input)?;
    let (input, leading) = parse_le_i16(input)?;
    (input, align, margin_left, margin_right, indent, leading)
  } else {
    (input, ast::text::TextAlignment::Left, 0, 0, 0, 0)
  };
  let (input, variable_name) = parse_c_string(input)?;
  let variable_name = if variable_name.len() > 0 {
    Some(variable_name)
  } else {
    None
  };
  let (input, text) = cond(has_text, parse_c_string)(input)?;

  Ok((
    input,
    ast::tags::DefineDynamicText {
      id,
      bounds,
      word_wrap,
      multiline,
      password,
      readonly,
      auto_size,
      no_select,
      border,
      was_static,
      html,
      use_glyph_font,
      font_id,
      font_class,
      font_size,
      color,
      max_length,
      align,
      margin_left,
      margin_right,
      indent,
      leading,
      variable_name,
      text,
    },
  ))
}

pub fn parse_define_font(input: &[u8]) -> IResult<&[u8], ast::tags::DefineGlyphFont> {
  let (input, id) = parse_le_u16(input)?;
  let available = input.len();
  let mut glyphs: Vec<Glyph> = Vec::new();

  if available > 0 {
    let saved_input: &[u8] = input;

    let (mut input, first_offset) = parse_le_u16(input)?;
    let first_offset: usize = first_offset.into();
    // TODO: assert `first_offset` is even.
    let glyph_count: usize = first_offset / 2;
    let mut offsets: Vec<usize> = Vec::with_capacity(glyph_count);
    offsets.push(first_offset);
    for _ in 1..glyph_count {
      let (next_input, offset) = parse_le_u16(input)?;
      input = next_input;
      offsets.push(offset.into());
    }

    for i in 0..glyph_count {
      let start_offset = offsets[i];
      let glyph_input = if i + 1 < glyph_count {
        let end_offset = offsets[i + 1];
        &saved_input[start_offset..end_offset]
      } else {
        &saved_input[start_offset..]
      };
      match parse_glyph(glyph_input) {
        Ok((_, o)) => glyphs.push(o),
        Err(e) => return Err(e),
      };
    }
  }

  Ok((&[], ast::tags::DefineGlyphFont { id, glyphs }))
}

pub fn parse_define_font2(input: &[u8]) -> IResult<&[u8], ast::tags::DefineFont> {
  parse_define_font_any(input, FontVersion::Font2)
}

pub fn parse_define_font3(input: &[u8]) -> IResult<&[u8], ast::tags::DefineFont> {
  parse_define_font_any(input, FontVersion::Font3)
}

// https://github.com/mozilla/shumway/blob/16451d8836fa85f4b16eeda8b4bda2fa9e2b22b0/src/swf/parser/module.ts#L632
fn parse_define_font_any(input: &[u8], version: FontVersion) -> IResult<&[u8], ast::tags::DefineFont> {
  use nom::bytes::complete::take;
  use nom::combinator::{cond, map};
  use nom::multi::count;

  let (input, id) = parse_le_u16(input)?;

  let (input, flags) = parse_u8(input)?;
  let is_bold = (flags & (1 << 0)) != 0;
  let is_italic = (flags & (1 << 1)) != 0;
  let use_wide_codes = (flags & (1 << 2)) != 0;
  let use_wide_offsets = (flags & (1 << 3)) != 0;
  let is_ansi = (flags & (1 << 4)) != 0;
  let is_small = (flags & (1 << 5)) != 0;
  let is_shift_jis = (flags & (1 << 6)) != 0;
  let has_layout = (flags & (1 << 7)) != 0;

  let em_square_size = if version >= FontVersion::Font3 {
    ast::text::EmSquareSize::EmSquareSize20480
  } else {
    ast::text::EmSquareSize::EmSquareSize1024
  };

  let (input, language) = parse_language_code(input)?;
  let (input, font_name) = {
    let (input, font_name_len) = map(parse_u8, usize::from)(input)?;
    let (input, font_name_bytes) = take(font_name_len)(input)?;
    let (_, font_name) = parse_block_c_string(font_name_bytes)?;
    (input, font_name)
  };
  let (input, glyph_count) = map(parse_le_u16, |x| x as usize)(input)?;

  // According to Shumway:
  // > The SWF format docs doesn't say that, but the DefineFont{2,3} tag ends here for device fonts.
  // See the sample `open-flash-db/tags/define-font-df3-system-font-verdana`.
  if glyph_count == 0 {
    Ok((
      input,
      ast::tags::DefineFont {
        id,
        font_name,
        is_bold,
        is_italic,
        is_ansi,
        is_small,
        is_shift_jis,
        em_square_size,
        language,
        glyphs: None,
        code_units: None,
        layout: None,
      },
    ))
  } else {
    let (input, glyphs) = parse_offset_glyphs(input, glyph_count, use_wide_offsets)?;
    let (input, code_units) = if use_wide_codes {
      count(parse_le_u16, glyph_count)(input)?
    } else {
      count(map(parse_u8, u16::from), glyph_count)(input)?
    };
    let (input, layout) = cond(has_layout, |i| parse_font_layout(i, glyph_count))(input)?;
    Ok((
      input,
      ast::tags::DefineFont {
        id,
        font_name,
        is_bold,
        is_italic,
        is_ansi,
        is_small,
        is_shift_jis,
        em_square_size,
        language,
        glyphs: Option::Some(glyphs),
        code_units: Option::Some(code_units),
        layout,
      },
    ))
  }
}

pub fn parse_define_font4(input: &[u8]) -> IResult<&[u8], ast::tags::DefineCffFont> {
  use nom::combinator::cond;

  let (input, id) = parse_le_u16(input)?;
  let (input, font_name) = parse_c_string(input)?;

  let (input, flags) = parse_u8(input)?;
  let is_bold = (flags & (1 << 0)) != 0;
  let is_italic = (flags & (1 << 1)) != 0;
  let has_data = (flags & (1 << 2)) != 0;
  // Bits [3, 7] are reserved

  let (input, data) = cond(has_data, parse_bytes)(input)?;

  Ok((
    input,
    ast::tags::DefineCffFont {
      id,
      font_name,
      is_bold,
      is_italic,
      data,
    },
  ))
}

pub fn parse_define_font_align_zones<P>(
  input: &[u8],
  glyph_count_provider: P,
) -> IResult<&[u8], ast::tags::DefineFontAlignZones>
where
  P: Fn(usize) -> Option<usize>,
{
  use nom::bits::bits;
  use nom::multi::count;

  let (input, font_id) = parse_le_u16(input)?;
  // TODO(demurgos): Return an error if the glyph count is not found (instead of silently using default!)?
  let glyph_count = glyph_count_provider(font_id.into()).unwrap_or_default();

  let (input, csm_table_hint) = bits(parse_csm_table_hint_bits)(input)?;
  let (input, zones) = count(parse_font_alignment_zone, glyph_count)(input)?;

  Ok((
    input,
    ast::tags::DefineFontAlignZones {
      font_id,
      csm_table_hint,
      zones,
    },
  ))
}

pub fn parse_define_font_info(input: &[u8]) -> IResult<&[u8], ast::tags::DefineFontInfo> {
  parse_define_font_info_any(input, FontInfoVersion::FontInfo1)
}

pub fn parse_define_font_info2(input: &[u8]) -> IResult<&[u8], ast::tags::DefineFontInfo> {
  parse_define_font_info_any(input, FontInfoVersion::FontInfo2)
}

fn parse_define_font_info_any(input: &[u8], version: FontInfoVersion) -> IResult<&[u8], ast::tags::DefineFontInfo> {
  use nom::bytes::complete::take;
  use nom::combinator::map;

  fn parse_code_units(mut input: &[u8], use_wide_codes: bool) -> IResult<&[u8], Vec<u16>> {
    if use_wide_codes {
      // TODO: Handle odd values
      let code_unit_count = input.len() / 2;
      let mut code_units: Vec<u16> = Vec::with_capacity(code_unit_count);

      for _ in 0..code_unit_count {
        let (next_input, code_unit) = parse_le_u16(input)?;
        input = next_input;
        code_units.push(code_unit);
      }

      Ok((input, code_units))
    } else {
      let code_units: Vec<u16> = input.iter().map(|x| u16::from(*x)).collect();
      Ok((&[][..], code_units))
    }
  }

  let (input, font_id) = parse_le_u16(input)?;
  let (input, font_name) = {
    let (input, font_name_len) = map(parse_u8, usize::from)(input)?;
    let (input, font_name_bytes) = take(font_name_len)(input)?;
    let (_, font_name) = parse_block_c_string(font_name_bytes)?;
    (input, font_name)
  };
  let (input, flags) = parse_u8(input)?;
  let use_wide_codes = (flags & (1 << 0)) != 0;
  let is_bold = (flags & (1 << 1)) != 0;
  let is_italic = (flags & (1 << 2)) != 0;
  let is_ansi = (flags & (1 << 3)) != 0;
  let is_shift_jis = (flags & (1 << 4)) != 0;
  let is_small = (flags & (1 << 5)) != 0;
  let (input, language) = if version >= FontInfoVersion::FontInfo2 {
    parse_language_code(input)?
  } else {
    (input, ast::LanguageCode::Auto)
  };
  let (input, code_units) = parse_code_units(input, use_wide_codes)?;

  Ok((
    input,
    ast::tags::DefineFontInfo {
      font_id,
      font_name,
      is_bold,
      is_italic,
      is_ansi,
      is_shift_jis,
      is_small,
      language,
      code_units,
    },
  ))
}

pub fn parse_define_font_name(input: &[u8]) -> IResult<&[u8], ast::tags::DefineFontName> {
  let (input, font_id) = parse_le_u16(input)?;
  let (input, name) = parse_c_string(input)?;
  let (input, copyright) = parse_c_string(input)?;
  Ok((
    input,
    ast::tags::DefineFontName {
      font_id,
      name,
      copyright,
    },
  ))
}

pub fn parse_define_jpeg_tables(input: &[u8], _swf_version: u8) -> IResult<&[u8], ast::tags::DefineJpegTables> {
  let data: Vec<u8> = input.to_vec();
  let input: &[u8] = &[][..];

  //  if !(test_image_start(&data, &JPEG_START) || (swf_version < 8 && test_image_start(&data, &ERRONEOUS_JPEG_START))) {
  //    panic!("InvalidJpegTablesSignature");
  //  }

  Ok((input, ast::tags::DefineJpegTables { data }))
}

pub fn parse_define_morph_shape(input: &[u8]) -> IResult<&[u8], ast::tags::DefineMorphShape> {
  parse_define_morph_shape_any(input, MorphShapeVersion::MorphShape1)
}

pub fn parse_define_morph_shape2(input: &[u8]) -> IResult<&[u8], ast::tags::DefineMorphShape> {
  parse_define_morph_shape_any(input, MorphShapeVersion::MorphShape2)
}

fn parse_define_morph_shape_any(
  input: &[u8],
  version: MorphShapeVersion,
) -> IResult<&[u8], ast::tags::DefineMorphShape> {
  use nom::combinator::cond;

  let (input, id) = parse_le_u16(input)?;
  let (input, bounds) = parse_rect(input)?;
  let (input, morph_bounds) = parse_rect(input)?;
  let (input, edge_bounds) = cond(version >= MorphShapeVersion::MorphShape2, parse_rect)(input)?;
  let (input, morph_edge_bounds) = cond(version >= MorphShapeVersion::MorphShape2, parse_rect)(input)?;

  let (input, flags) = cond(version >= MorphShapeVersion::MorphShape2, parse_u8)(input)?;
  let flags = flags.unwrap_or(0);
  let has_scaling_strokes = (flags & (1 << 0)) != 0;
  let has_non_scaling_strokes = (flags & (1 << 1)) != 0;
  // (Skip bits [2, 7])

  let (input, shape) = parse_morph_shape(input, version)?;

  Ok((
    input,
    ast::tags::DefineMorphShape {
      id,
      bounds,
      morph_bounds,
      edge_bounds,
      morph_edge_bounds,
      has_scaling_strokes,
      has_non_scaling_strokes,
      shape,
    },
  ))
}

pub fn parse_define_scaling_grid(input: &[u8]) -> IResult<&[u8], ast::tags::DefineScalingGrid> {
  let (input, character_id) = parse_le_u16(input)?;
  let (input, splitter) = parse_rect(input)?;
  Ok((input, ast::tags::DefineScalingGrid { character_id, splitter }))
}

pub fn parse_define_scene_and_frame_label_data_tag(
  input: &[u8],
) -> IResult<&[u8], ast::tags::DefineSceneAndFrameLabelData> {
  use nom::combinator::map;
  use nom::multi::count;
  let (input, scene_count) = map(parse_leb128_u32, |x| usize::try_from(x).unwrap())(input)?;
  let (input, scenes) = count(parse_scene, scene_count)(input)?;
  let (input, label_count) = map(parse_leb128_u32, |x| usize::try_from(x).unwrap())(input)?;
  let (input, labels) = count(parse_label, label_count)(input)?;

  fn parse_scene(input: &[u8]) -> IResult<&[u8], ast::tags::Scene> {
    let (input, offset) = parse_leb128_u32(input)?;
    let (input, name) = parse_c_string(input)?;
    Ok((input, ast::tags::Scene { offset, name }))
  }

  fn parse_label(input: &[u8]) -> IResult<&[u8], ast::tags::Label> {
    let (input, frame) = parse_leb128_u32(input)?;
    let (input, name) = parse_c_string(input)?;
    Ok((input, ast::tags::Label { frame, name }))
  }

  Ok((input, ast::tags::DefineSceneAndFrameLabelData { scenes, labels }))
}

pub fn parse_define_shape(input: &[u8]) -> IResult<&[u8], ast::tags::DefineShape> {
  parse_define_shape_any(input, ShapeVersion::Shape1)
}

pub fn parse_define_shape2(input: &[u8]) -> IResult<&[u8], ast::tags::DefineShape> {
  parse_define_shape_any(input, ShapeVersion::Shape2)
}

pub fn parse_define_shape3(input: &[u8]) -> IResult<&[u8], ast::tags::DefineShape> {
  parse_define_shape_any(input, ShapeVersion::Shape3)
}

pub fn parse_define_shape4(input: &[u8]) -> IResult<&[u8], ast::tags::DefineShape> {
  parse_define_shape_any(input, ShapeVersion::Shape4)
}

fn parse_define_shape_any(input: &[u8], version: ShapeVersion) -> IResult<&[u8], ast::tags::DefineShape> {
  use nom::combinator::cond;

  let (input, id) = parse_le_u16(input)?;
  let (input, bounds) = parse_rect(input)?;
  let (input, edge_bounds) = cond(version >= ShapeVersion::Shape4, parse_rect)(input)?;

  let (input, flags) = cond(version >= ShapeVersion::Shape4, parse_u8)(input)?;
  let flags = flags.unwrap_or(0);
  let has_scaling_strokes = (flags & (1 << 0)) != 0;
  let has_non_scaling_strokes = (flags & (1 << 1)) != 0;
  let has_fill_winding = (flags & (1 << 2)) != 0;
  // (Skip bits [3, 7])

  let (input, shape) = parse_shape(input, version)?;

  Ok((
    input,
    ast::tags::DefineShape {
      id,
      bounds,
      edge_bounds,
      has_scaling_strokes,
      has_non_scaling_strokes,
      has_fill_winding,
      shape,
    },
  ))
}

fn parse_bytes(input: &[u8]) -> IResult<&[u8], Vec<u8>> {
  Ok((&[][..], input.to_vec()))
}

fn parse_define_sound(input: &[u8]) -> IResult<&[u8], ast::tags::DefineSound> {
  let (input, id) = parse_le_u16(input)?;
  let (input, flags) = parse_u8(input)?;
  let sound_type = if (flags & (1 << 0)) != 0 {
    ast::SoundType::Stereo
  } else {
    ast::SoundType::Mono
  };
  let sound_size = if (flags & (1 << 1)) != 0 {
    ast::SoundSize::SoundSize16
  } else {
    ast::SoundSize::SoundSize8
  };
  let sound_rate = sound_rate_from_id((flags >> 2) & 0b11);
  let format = audio_coding_format_from_id((flags >> 4) & 0b1111);
  let (input, sample_count) = parse_le_u32(input)?;
  let (input, data) = parse_bytes(input)?;

  Ok((
    input,
    ast::tags::DefineSound {
      id,
      sound_type,
      sound_size: if is_uncompressed_audio_coding_format(&format) {
        sound_size
      } else {
        ast::SoundSize::SoundSize16
      },
      sound_rate,
      format,
      sample_count,
      data,
    },
  ))
}

// TODO: Readonly `state`?
pub fn parse_define_sprite<'a>(input: &'a [u8], state: &ParseState) -> IResult<&'a [u8], ast::tags::DefineSprite> {
  let (input, id) = parse_le_u16(input)?;
  let (input, frame_count) = parse_le_u16(input)?;
  let (input, tags) = parse_tag_block_string(input, state)?;
  Ok((
    input,
    ast::tags::DefineSprite {
      id: id,
      frame_count: frame_count as usize,
      tags: tags,
    },
  ))
}

pub fn parse_define_text(input: &[u8]) -> IResult<&[u8], ast::tags::DefineText> {
  parse_define_text_any(input, TextVersion::Text1)
}

pub fn parse_define_text2(input: &[u8]) -> IResult<&[u8], ast::tags::DefineText> {
  parse_define_text_any(input, TextVersion::Text2)
}

pub fn parse_define_text_any(input: &[u8], version: TextVersion) -> IResult<&[u8], ast::tags::DefineText> {
  use nom::combinator::map;

  let (input, id) = parse_le_u16(input)?;
  let (input, bounds) = parse_rect(input)?;
  let (input, matrix) = parse_matrix(input)?;
  let (input, index_bits) = map(parse_u8, |x| x as usize)(input)?;
  let (input, advance_bits) = map(parse_u8, |x| x as usize)(input)?;
  let has_alpha = version >= TextVersion::Text2;
  let (input, records) = parse_text_record_string(input, has_alpha, index_bits, advance_bits)?;

  Ok((
    input,
    ast::tags::DefineText {
      id: id,
      bounds: bounds,
      matrix: matrix,
      records: records,
    },
  ))
}

pub fn parse_define_video_stream(input: &[u8]) -> IResult<&[u8], ast::tags::DefineVideoStream> {
  use nom::combinator::map;

  let (input, id) = parse_le_u16(input)?;
  let (input, frame_count) = map(parse_le_u16, |fc| usize::from(fc))(input)?;
  let (input, width) = parse_le_u16(input)?;
  let (input, height) = parse_le_u16(input)?;
  let (input, flags) = parse_u8(input)?;
  let use_smoothing = (flags & (1 << 0)) != 0;
  let deblocking = video_deblocking_from_id((flags >> 1) & 0b111);
  // Bits [4, 7] are reserved
  let (input, codec) = parse_videoc_codec(input)?;

  Ok((
    input,
    ast::tags::DefineVideoStream {
      id,
      frame_count,
      width,
      height,
      use_smoothing,
      deblocking,
      codec,
    },
  ))
}

pub fn parse_do_abc(input: &[u8]) -> IResult<&[u8], ast::tags::DoAbc> {
  let (input, flags) = parse_le_u32(input)?;
  let (input, name) = parse_c_string(input)?;
  let (input, data) = parse_bytes(input)?;
  Ok((input, ast::tags::DoAbc { flags, name, data }))
}

pub fn parse_do_action(input: &[u8]) -> IResult<&[u8], ast::tags::DoAction> {
  let (input, actions) = parse_bytes(input)?;
  Ok((input, ast::tags::DoAction { actions }))
}

pub fn parse_do_init_action(input: &[u8]) -> IResult<&[u8], ast::tags::DoInitAction> {
  let (input, sprite_id) = parse_le_u16(input)?;
  let (input, actions) = (&[][..], input.to_vec());
  Ok((input, ast::tags::DoInitAction { sprite_id, actions }))
}

pub fn parse_enable_debugger(input: &[u8]) -> IResult<&[u8], ast::tags::EnableDebugger> {
  let (input, password) = parse_c_string(input)?;
  Ok((input, ast::tags::EnableDebugger { password }))
}

pub fn parse_enable_debugger2(input: &[u8]) -> IResult<&[u8], ast::tags::EnableDebugger> {
  use nom::bytes::complete::take;
  let (input, _) = take(2usize)(input)?;
  let (input, password) = parse_c_string(input)?;
  Ok((input, ast::tags::EnableDebugger { password }))
}

pub fn parse_enable_telemetry(input: &[u8]) -> IResult<&[u8], ast::tags::Telemetry> {
  use nom::bytes::complete::take;
  use nom::combinator::cond;
  const HASH_SIZE: usize = 32;
  let (input, _) = take(2usize)(input)?;
  let (input, password) = cond(input.len() >= HASH_SIZE, take(HASH_SIZE))(input)?;
  Ok((
    input,
    ast::tags::Telemetry {
      password: password.map(|p| p.to_vec()),
    },
  ))
}

pub fn parse_export_assets(input: &[u8]) -> IResult<&[u8], ast::tags::ExportAssets> {
  use nom::combinator::map;
  use nom::multi::count;
  let (input, asset_count) = map(parse_le_u16, usize::from)(input)?;
  let (input, assets) = count(parse_named_id, asset_count)(input)?;
  Ok((input, ast::tags::ExportAssets { assets }))
}

pub fn parse_file_attributes_tag(input: &[u8]) -> IResult<&[u8], ast::tags::FileAttributes> {
  let (input, flags) = parse_le_u32(input)?;
  let use_network = (flags & (1 << 0)) != 0;
  let use_relative_urls = (flags & (1 << 1)) != 0;
  let no_cross_domain_caching = (flags & (1 << 2)) != 0;
  let use_as3 = (flags & (1 << 3)) != 0;
  let has_metadata = (flags & (1 << 4)) != 0;
  let use_gpu = (flags & (1 << 5)) != 0;
  let use_direct_blit = (flags & (1 << 6)) != 0;

  Ok((
    input,
    ast::tags::FileAttributes {
      use_network: use_network,
      use_relative_urls: use_relative_urls,
      no_cross_domain_caching: no_cross_domain_caching,
      use_as3: use_as3,
      has_metadata: has_metadata,
      use_gpu: use_gpu,
      use_direct_blit: use_direct_blit,
    },
  ))
}

pub fn parse_frame_label(input: &[u8]) -> IResult<&[u8], ast::tags::FrameLabel> {
  // TODO: Use nom macros/atEof
  let (input, name) = parse_c_string(input)?;
  let (input, is_anchor) = if input.len() > 0 {
    let (input, anchor_flag) = parse_u8(input)?;
    (input, anchor_flag != 0)
  } else {
    (input, false)
  };

  Ok((input, ast::tags::FrameLabel { name, is_anchor }))
}

pub fn parse_import_assets(input: &[u8]) -> IResult<&[u8], ast::tags::ImportAssets> {
  use nom::combinator::map;
  use nom::multi::count;
  let (input, url) = parse_c_string(input)?;
  let (input, asset_count) = map(parse_le_u16, usize::from)(input)?;
  let (input, assets) = count(parse_named_id, asset_count)(input)?;
  Ok((input, ast::tags::ImportAssets { url, assets }))
}

#[allow(unused_variables)]
pub fn parse_import_assets2(input: &[u8]) -> IResult<&[u8], ast::tags::ImportAssets> {
  use nom::bytes::complete::take;
  use nom::combinator::map;
  use nom::multi::count;

  let (input, url) = parse_c_string(input)?;
  let (input, _) = take(2usize)(input)?;
  let (input, asset_count) = map(parse_le_u16, usize::from)(input)?;
  let (input, assets) = count(parse_named_id, asset_count)(input)?;
  Ok((input, ast::tags::ImportAssets { url, assets }))
}

pub fn parse_metadata(input: &[u8]) -> IResult<&[u8], ast::tags::Metadata> {
  let (input, metadata) = parse_c_string(input)?;
  Ok((input, ast::tags::Metadata { metadata }))
}

pub fn parse_place_object(input: &[u8]) -> IResult<&[u8], ast::tags::PlaceObject> {
  use nom::combinator::{cond, map};

  let (input, character_id) = parse_le_u16(input)?;
  let (input, depth) = parse_le_u16(input)?;
  let (input, matrix) = parse_matrix(input)?;
  let (input, color_transform) = cond(
    input.len() > 0,
    map(parse_color_transform, |color_transform| ast::ColorTransformWithAlpha {
      red_mult: color_transform.red_mult,
      green_mult: color_transform.green_mult,
      blue_mult: color_transform.blue_mult,
      alpha_mult: ::swf_fixed::Sfixed8P8::ONE,
      red_add: color_transform.red_add,
      green_add: color_transform.green_add,
      blue_add: color_transform.blue_add,
      alpha_add: 0,
    }),
  )(input)?;

  Ok((
    input,
    ast::tags::PlaceObject {
      is_update: false,
      depth,
      character_id: Option::Some(character_id),
      matrix: Option::Some(matrix),
      color_transform,
      ratio: Option::None,
      name: Option::None,
      class_name: Option::None,
      clip_depth: Option::None,
      filters: Option::None,
      blend_mode: Option::None,
      bitmap_cache: Option::None,
      visible: Option::None,
      background_color: Option::None,
      clip_actions: Option::None,
    },
  ))
}

/// `extended_events` corresponds to `swf_version >= 6`
pub fn parse_place_object2(input: &[u8], extended_events: bool) -> IResult<&[u8], ast::tags::PlaceObject> {
  use nom::combinator::cond;

  let (input, flags) = parse_u8(input)?;
  let is_update = (flags & (1 << 0)) != 0;
  let has_character_id = (flags & (1 << 1)) != 0;
  let has_matrix = (flags & (1 << 2)) != 0;
  let has_color_transform = (flags & (1 << 3)) != 0;
  let has_ratio = (flags & (1 << 4)) != 0;
  let has_name = (flags & (1 << 5)) != 0;
  let has_clip_depth = (flags & (1 << 6)) != 0;
  let has_clip_actions = (flags & (1 << 7)) != 0;
  let (input, depth) = parse_le_u16(input)?;
  let (input, character_id) = cond(has_character_id, parse_le_u16)(input)?;
  let (input, matrix) = cond(has_matrix, parse_matrix)(input)?;
  let (input, color_transform) = cond(has_color_transform, parse_color_transform_with_alpha)(input)?;
  let (input, ratio) = cond(has_ratio, parse_le_u16)(input)?;
  let (input, name) = cond(has_name, parse_c_string)(input)?;
  let (input, clip_depth) = cond(has_clip_depth, parse_le_u16)(input)?;
  let (input, clip_actions) = cond(has_clip_actions, |i| parse_clip_actions_string(i, extended_events))(input)?;

  Ok((
    input,
    ast::tags::PlaceObject {
      is_update,
      depth,
      character_id,
      matrix,
      color_transform,
      ratio,
      name,
      class_name: None,
      clip_depth,
      filters: None,
      blend_mode: None,
      bitmap_cache: None,
      visible: None,
      background_color: None,
      clip_actions,
    },
  ))
}

/// `extended_events` corresponds to `swf_version >= 6`
pub fn parse_place_object3(input: &[u8], extended_events: bool) -> IResult<&[u8], ast::tags::PlaceObject> {
  use nom::combinator::{cond, map};

  let (input, flags) = parse_le_u16(input)?;
  let is_update = (flags & (1 << 0)) != 0;
  let has_character_id = (flags & (1 << 1)) != 0;
  let has_matrix = (flags & (1 << 2)) != 0;
  let has_color_transform = (flags & (1 << 3)) != 0;
  let has_ratio = (flags & (1 << 4)) != 0;
  let has_name = (flags & (1 << 5)) != 0;
  let has_clip_depth = (flags & (1 << 6)) != 0;
  let has_clip_actions = (flags & (1 << 7)) != 0;
  let has_filters = (flags & (1 << 8)) != 0;
  let has_blend_mode = (flags & (1 << 9)) != 0;
  let has_cache_hint = (flags & (1 << 10)) != 0;
  let has_class_name = (flags & (1 << 11)) != 0;
  let has_image = (flags & (1 << 12)) != 0;
  let has_visibility = (flags & (1 << 13)) != 0;
  let has_background_color = (flags & (1 << 14)) != 0;
  // Skip bit 15

  let (input, depth) = parse_le_u16(input)?;
  let (input, class_name) = cond(has_class_name || (has_image && has_character_id), parse_c_string)(input)?;
  let (input, character_id) = cond(has_character_id, parse_le_u16)(input)?;
  let (input, matrix) = cond(has_matrix, parse_matrix)(input)?;
  let (input, color_transform) = cond(has_color_transform, parse_color_transform_with_alpha)(input)?;
  let (input, ratio) = cond(has_ratio, parse_le_u16)(input)?;
  let (input, name) = cond(has_name, parse_c_string)(input)?;
  let (input, clip_depth) = cond(has_clip_depth, parse_le_u16)(input)?;
  let (input, filters) = cond(has_filters, parse_filter_list)(input)?;
  let (input, blend_mode) = cond(has_blend_mode, parse_blend_mode)(input)?;
  let (input, use_bitmap_cache) = cond(has_cache_hint, map(parse_u8, |x| x != 0))(input)?;
  let (input, is_visible) = cond(has_visibility, map(parse_u8, |x| x != 0))(input)?;
  // TODO(demurgos): Check if it is RGBA or ARGB
  let (input, background_color) = cond(has_background_color, parse_straight_s_rgba8)(input)?;
  let (input, clip_actions) = cond(has_clip_actions, |i| parse_clip_actions_string(i, extended_events))(input)?;

  Ok((
    input,
    ast::tags::PlaceObject {
      is_update: is_update,
      depth: depth,
      character_id: character_id,
      matrix: matrix,
      color_transform: color_transform,
      ratio: ratio,
      name: name,
      class_name: class_name,
      clip_depth: clip_depth,
      filters: filters,
      blend_mode: blend_mode,
      bitmap_cache: use_bitmap_cache,
      visible: is_visible,
      background_color: background_color,
      clip_actions: clip_actions,
    },
  ))
}

fn parse_protect(input: &[u8]) -> IResult<&[u8], ast::tags::Protect> {
  let (input, password) = parse_block_c_string(input)?;
  Ok((input, ast::tags::Protect { password }))
}

pub fn parse_remove_object(input: &[u8]) -> IResult<&[u8], ast::tags::RemoveObject> {
  use nom::combinator::map;
  let (input, character_id) = map(parse_le_u16, Some)(input)?;
  let (input, depth) = parse_le_u16(input)?;
  Ok((input, ast::tags::RemoveObject { character_id, depth }))
}

pub fn parse_remove_object2(input: &[u8]) -> IResult<&[u8], ast::tags::RemoveObject> {
  let (input, depth) = parse_le_u16(input)?;
  Ok((
    input,
    ast::tags::RemoveObject {
      character_id: None,
      depth,
    },
  ))
}

pub fn parse_script_limits(input: &[u8]) -> IResult<&[u8], ast::tags::ScriptLimits> {
  let (input, max_recursion_depth) = parse_le_u16(input)?;
  let (input, script_timeout) = parse_le_u16(input)?;
  Ok((
    input,
    ast::tags::ScriptLimits {
      max_recursion_depth,
      script_timeout,
    },
  ))
}

pub fn parse_set_background_color_tag(input: &[u8]) -> IResult<&[u8], ast::tags::SetBackgroundColor> {
  let (input, color) = parse_s_rgb8(input)?;
  Ok((input, ast::tags::SetBackgroundColor { color }))
}

pub fn parse_set_tab_index(input: &[u8]) -> IResult<&[u8], ast::tags::SetTabIndex> {
  let (input, depth) = parse_le_u16(input)?;
  let (input, index) = parse_le_u16(input)?;
  Ok((input, ast::tags::SetTabIndex { depth, index }))
}

fn parse_sound_stream_block(input: &[u8]) -> IResult<&[u8], ast::tags::SoundStreamBlock> {
  let (input, data) = parse_bytes(input)?;
  Ok((input, ast::tags::SoundStreamBlock { data }))
}

fn parse_sound_stream_head(input: &[u8]) -> IResult<&[u8], ast::tags::SoundStreamHead> {
  parse_sound_stream_head_any(input)
}

fn parse_sound_stream_head2(input: &[u8]) -> IResult<&[u8], ast::tags::SoundStreamHead> {
  parse_sound_stream_head_any(input)
}

fn parse_sound_stream_head_any(input: &[u8]) -> IResult<&[u8], ast::tags::SoundStreamHead> {
  use nom::combinator::cond;
  let (input, flags) = parse_le_u16(input)?;
  let playback_sound_type = if (flags & (1 << 0)) != 0 {
    ast::SoundType::Stereo
  } else {
    ast::SoundType::Mono
  };
  let playback_sound_size = if (flags & (1 << 1)) != 0 {
    ast::SoundSize::SoundSize16
  } else {
    ast::SoundSize::SoundSize8
  };
  let playback_sound_rate = sound_rate_from_id(((flags >> 2) & 0b11) as u8);
  // Bits [4, 7] are reserved
  let stream_sound_type = if (flags & (1 << 8)) != 0 {
    ast::SoundType::Stereo
  } else {
    ast::SoundType::Mono
  };
  let stream_sound_size = if (flags & (1 << 9)) != 0 {
    ast::SoundSize::SoundSize16
  } else {
    ast::SoundSize::SoundSize8
  };
  let stream_sound_rate = sound_rate_from_id(((flags >> 10) & 0b11) as u8);
  let stream_format = audio_coding_format_from_id(((flags >> 12) & 0b1111) as u8);
  let (input, stream_sample_count) = parse_le_u16(input)?;
  let (input, latency_seek) = cond(stream_format == ast::AudioCodingFormat::Mp3, parse_le_i16)(input)?;
  Ok((
    input,
    ast::tags::SoundStreamHead {
      playback_sound_type,
      playback_sound_size,
      playback_sound_rate,
      stream_sound_type,
      stream_sound_size: if is_uncompressed_audio_coding_format(&stream_format) {
        stream_sound_size
      } else {
        ast::SoundSize::SoundSize16
      },
      stream_sound_rate,
      stream_format,
      stream_sample_count,
      latency_seek,
    },
  ))
}

pub fn parse_start_sound(input: &[u8]) -> IResult<&[u8], ast::tags::StartSound> {
  let (input, sound_id) = parse_le_u16(input)?;
  let (input, sound_info) = parse_sound_info(input)?;
  Ok((input, ast::tags::StartSound { sound_id, sound_info }))
}

pub fn parse_start_sound2(input: &[u8]) -> IResult<&[u8], ast::tags::StartSound2> {
  let (input, sound_class_name) = parse_c_string(input)?;
  let (input, sound_info) = parse_sound_info(input)?;
  Ok((
    input,
    ast::tags::StartSound2 {
      sound_class_name,
      sound_info,
    },
  ))
}

pub fn parse_symbol_class(input: &[u8]) -> IResult<&[u8], ast::tags::SymbolClass> {
  use nom::combinator::map;
  use nom::multi::count;
  let (input, symbol_count) = map(parse_le_u16, usize::from)(input)?;
  let (input, symbols) = count(parse_named_id, symbol_count)(input)?;
  Ok((input, ast::tags::SymbolClass { symbols }))
}

pub fn parse_video_frame(input: &[u8]) -> IResult<&[u8], ast::tags::VideoFrame> {
  let (input, video_id) = parse_le_u16(input)?;
  let (input, frame) = parse_le_u16(input)?;
  let (input, packet) = parse_bytes(input)?;
  Ok((
    input,
    ast::tags::VideoFrame {
      video_id,
      frame,
      packet,
    },
  ))
}
