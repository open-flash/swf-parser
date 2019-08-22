use crate::parsers::basic_data_types::{
  parse_block_c_string, parse_c_string, parse_color_transform, parse_color_transform_with_alpha, parse_language_code,
  parse_leb128_u32, parse_matrix, parse_named_id, parse_rect, parse_s_rgb8, parse_straight_s_rgba8,
};
use crate::parsers::button::{parse_button2_cond_action_string, parse_button_record_string, ButtonVersion};
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
  parse_csm_table_hint_bits, parse_font_alignment_zone, parse_font_layout, parse_grid_fitting_bits,
  parse_offset_glyphs, parse_text_alignment, parse_text_record_string, parse_text_renderer_bits, FontVersion,
};
use crate::state::ParseState;
use nom::number::streaming::{
  be_u16 as parse_be_u16, le_f32 as parse_le_f32, le_i16 as parse_le_i16, le_u16 as parse_le_u16,
  le_u32 as parse_le_u32, le_u8 as parse_u8,
};
use nom::{IResult, Needed};
use swf_tree as ast;
use swf_tree::{ButtonCondAction, Glyph};

fn parse_tag_header(input: &[u8]) -> IResult<&[u8], ast::TagHeader> {
  match parse_le_u16(input) {
    Ok((remaining_input, code_and_length)) => {
      let code = code_and_length >> 6;
      let max_length = (1 << 6) - 1;
      let length = code_and_length & max_length;
      if length < max_length {
        Ok((
          remaining_input,
          ast::TagHeader {
            code,
            length: length.into(),
          },
        ))
      } else {
        map!(remaining_input, parse_le_u32, |length| ast::TagHeader { code, length })
      }
    }
    Err(e) => Err(e),
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
        let record_result = match rh.code {
          1 => Ok((&[][..], ast::Tag::ShowFrame)),
          2 => map!(record_data, parse_define_shape, |t| ast::Tag::DefineShape(t)),
          4 => map!(record_data, parse_place_object, |t| ast::Tag::PlaceObject(t)),
          5 => map!(record_data, parse_remove_object, |t| ast::Tag::RemoveObject(t)),
          6 => map!(record_data, |i| parse_define_bits(i, state.get_swf_version()), |t| {
            ast::Tag::DefineBitmap(t)
          }),
          7 => map!(record_data, parse_define_button, |t| ast::Tag::DefineButton(t)),
          8 => map!(
            record_data,
            |i| parse_define_jpeg_tables(i, state.get_swf_version()),
            |t| ast::Tag::DefineJpegTables(t)
          ),
          9 => map!(record_data, parse_set_background_color_tag, |t| {
            ast::Tag::SetBackgroundColor(t)
          }),
          10 => map!(record_data, parse_define_font, |t| ast::Tag::DefineGlyphFont(t)),
          11 => map!(record_data, parse_define_text, |t| ast::Tag::DefineText(t)),
          12 => map!(record_data, parse_do_action, |t| ast::Tag::DoAction(t)),
          13 => map!(record_data, parse_define_font_info, |t| ast::Tag::DefineFontInfo(t)),
          14 => map!(record_data, parse_define_sound, |t| ast::Tag::DefineSound(t)),
          15 => map!(record_data, parse_start_sound, |t| ast::Tag::StartSound(t)),
          17 => map!(record_data, parse_define_button_sound, |_t| unimplemented!()),
          18 => map!(record_data, parse_sound_stream_head, |t| ast::Tag::SoundStreamHead(t)),
          19 => map!(record_data, parse_sound_stream_block, |t| ast::Tag::SoundStreamBlock(t)),
          20 => map!(record_data, parse_define_bits_lossless, |t| ast::Tag::DefineBitmap(t)),
          21 => map!(
            record_data,
            |i| parse_define_bits_jpeg2(i, state.get_swf_version()),
            |t| ast::Tag::DefineBitmap(t)
          ),
          22 => map!(record_data, parse_define_shape2, |t| ast::Tag::DefineShape(t)),
          23 => map!(record_data, parse_define_button_cxform, |_t| unimplemented!()),
          24 => map!(record_data, parse_protect, |t| ast::Tag::Protect(t)),
          26 => map!(
            record_data,
            |i| parse_place_object2(i, state.get_swf_version() >= 6),
            |t| ast::Tag::PlaceObject(t)
          ),
          28 => map!(record_data, parse_remove_object2, |t| ast::Tag::RemoveObject(t)),
          32 => map!(record_data, parse_define_shape3, |t| ast::Tag::DefineShape(t)),
          33 => map!(record_data, parse_define_text2, |t| ast::Tag::DefineText(t)),
          34 => map!(record_data, parse_define_button2, |t| ast::Tag::DefineButton(t)),
          35 => map!(
            record_data,
            |i| parse_define_bits_jpeg3(i, state.get_swf_version()),
            |t| ast::Tag::DefineBitmap(t)
          ),
          36 => map!(record_data, parse_define_bits_lossless2, |t| ast::Tag::DefineBitmap(t)),
          37 => map!(record_data, parse_define_edit_text, |t| ast::Tag::DefineDynamicText(t)),
          39 => map!(record_data, |i| parse_define_sprite(i, state), |t| {
            ast::Tag::DefineSprite(t)
          }),
          43 => map!(record_data, parse_frame_label, |t| ast::Tag::FrameLabel(t)),
          45 => map!(record_data, parse_sound_stream_head2, |t| ast::Tag::SoundStreamHead(t)),
          46 => map!(record_data, parse_define_morph_shape, |t| ast::Tag::DefineMorphShape(t)),
          48 => map!(record_data, parse_define_font2, |t| ast::Tag::DefineFont(t)),
          56 => map!(record_data, parse_export_assets, |t| ast::Tag::ExportAssets(t)),
          57 => map!(record_data, parse_import_assets, |t| ast::Tag::ImportAssets(t)),
          58 => map!(record_data, parse_enable_debugger, |t| ast::Tag::EnableDebugger(t)),
          59 => map!(record_data, parse_do_init_action, |t| ast::Tag::DoInitAction(t)),
          60 => map!(record_data, parse_define_video_stream, |_t| unimplemented!()),
          61 => map!(record_data, parse_video_frame, |_t| unimplemented!()),
          62 => map!(record_data, parse_define_font_info2, |t| ast::Tag::DefineFontInfo(t)),
          64 => map!(record_data, parse_enable_debugger2, |t| ast::Tag::EnableDebugger(t)),
          65 => map!(record_data, parse_script_limits, |t| ast::Tag::ScriptLimits(t)),
          66 => map!(record_data, parse_set_tab_index, |_t| unimplemented!()),
          69 => map!(record_data, parse_file_attributes_tag, |t| ast::Tag::FileAttributes(t)),
          70 => map!(
            record_data,
            |i| parse_place_object3(i, state.get_swf_version() >= 6),
            |t| ast::Tag::PlaceObject(t)
          ),
          71 => map!(record_data, parse_import_assets2, |t| ast::Tag::ImportAssets(t)),
          73 => map!(
            record_data,
            |i| parse_define_font_align_zones(i, |font_id| state.get_glyph_count(font_id)),
            |t| ast::Tag::DefineFontAlignZones(t)
          ),
          74 => map!(record_data, parse_csm_text_settings, |t| ast::Tag::CsmTextSettings(t)),
          75 => map!(record_data, parse_define_font3, |t| ast::Tag::DefineFont(t)),
          76 => map!(record_data, parse_symbol_class, |t| ast::Tag::SymbolClass(t)),
          77 => map!(record_data, parse_metadata, |t| ast::Tag::Metadata(t)),
          78 => map!(record_data, parse_define_scaling_grid, |_t| unimplemented!()),
          82 => map!(record_data, parse_do_abc, |t| ast::Tag::DoAbc(t)),
          83 => map!(record_data, parse_define_shape4, |t| ast::Tag::DefineShape(t)),
          84 => map!(record_data, parse_define_morph_shape2, |t| ast::Tag::DefineMorphShape(
            t
          )),
          86 => map!(record_data, parse_define_scene_and_frame_label_data_tag, |t| {
            ast::Tag::DefineSceneAndFrameLabelData(t)
          }),
          87 => map!(record_data, parse_define_binary_data, |t| ast::Tag::DefineBinaryData(t)),
          88 => map!(record_data, parse_define_font_name, |t| ast::Tag::DefineFontName(t)),
          89 => map!(record_data, parse_start_sound2, |t| ast::Tag::StartSound2(t)),
          90 => map!(record_data, parse_define_bits_jpeg4, |t| ast::Tag::DefineBitmap(t)),
          91 => map!(record_data, parse_define_font4, |t| ast::Tag::DefineFont(t)),
          93 => map!(record_data, parse_enable_telemetry, |_t| unimplemented!()),
          _ => Ok((
            &[][..],
            ast::Tag::Unknown(ast::tags::Unknown {
              code: rh.code,
              data: record_data.to_vec(),
            }),
          )),
        };
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

pub fn parse_csm_text_settings(input: &[u8]) -> IResult<&[u8], ast::tags::CsmTextSettings> {
  do_parse!(
    input,
    text_id: parse_le_u16 >>
    renderer_and_fitting: bits!(do_parse!(
      renderer: parse_text_renderer_bits >>
      fitting: parse_grid_fitting_bits >>
      // Implicitly skip 3 bits to align
      ((renderer, fitting))
    ))  >>
    thickness: parse_le_f32 >>
    sharpness: parse_le_f32 >>
    // TODO: Skip 1 byte / assert 1 byte is available
    (ast::tags::CsmTextSettings {
      text_id: text_id,
      renderer: renderer_and_fitting.0,
      fitting: renderer_and_fitting.1,
      thickness: thickness,
      sharpness: sharpness,
    })
  )
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

pub fn parse_define_button_cxform(_input: &[u8]) -> IResult<&[u8], ()> {
  unimplemented!()
}

pub fn parse_define_button_sound(_input: &[u8]) -> IResult<&[u8], ()> {
  unimplemented!()
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

pub fn parse_define_bits_jpeg4(_input: &[u8]) -> IResult<&[u8], ast::tags::DefineBitmap> {
  unimplemented!()
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
  do_parse!(
    input,
    id: parse_le_u16 >>
    bounds: parse_rect >>

    // TODO: parse_le_u16
    flags: parse_be_u16 >>
    has_text: value!((flags & (1 << 15)) != 0) >>
    word_wrap: value!((flags & (1 << 14)) != 0) >>
    multiline: value!((flags & (1 << 13)) != 0) >>
    password: value!((flags & (1 << 12)) != 0) >>
    readonly: value!((flags & (1 << 11)) != 0) >>
    has_color: value!((flags & (1 << 10)) != 0) >>
    has_max_length: value!((flags & (1 << 9)) != 0) >>
    has_font: value!((flags & (1 << 8)) != 0) >>
    has_font_class: value!((flags & (1 << 7)) != 0) >>
    auto_size: value!((flags & (1 << 6)) != 0) >>
    has_layout: value!((flags & (1 << 5)) != 0) >>
    no_select: value!((flags & (1 << 4)) != 0) >>
    border: value!((flags & (1 << 3)) != 0) >>
    was_static: value!((flags & (1 << 2)) != 0) >>
    html: value!((flags & (1 << 1)) != 0) >>
    use_glyph_font: value!((flags & (1 << 0)) != 0) >>

    font_id: cond!(has_font, parse_le_u16) >>
    font_class: cond!(has_font_class, parse_c_string) >>
    font_size: cond!(has_font, parse_le_u16) >>
    color: cond!(has_color, parse_straight_s_rgba8) >>
    max_length: cond!(has_max_length, map!(parse_le_u16, |x| x as usize)) >>
    align: map!(cond!(has_layout, parse_text_alignment), |x| x.unwrap_or(ast::text::TextAlignment::Left)) >>
    margin_left: map!(cond!(has_layout, parse_le_u16), |x| x.unwrap_or_default()) >>
    margin_right: map!(cond!(has_layout, parse_le_u16), |x| x.unwrap_or_default()) >>
    indent: map!(cond!(has_layout, parse_le_u16), |x| x.unwrap_or_default()) >>
    leading: map!(cond!(has_layout, parse_le_i16), |x| x.unwrap_or_default()) >>
    variable_name: map!(parse_c_string, |x| if x.len() > 0 {Option::Some(x)} else {Option::None}) >>
    text: cond!(has_text, parse_c_string) >>

    (ast::tags::DefineDynamicText {
      id: id,
      bounds: bounds,
      word_wrap: word_wrap,
      multiline: multiline,
      password: password,
      readonly: readonly,
      auto_size: auto_size,
      no_select: no_select,
      border: border,
      was_static: was_static,
      html: html,
      use_glyph_font: use_glyph_font,
      font_id: font_id,
      font_class: font_class,
      font_size: font_size,
      color: color,
      max_length: max_length,
      align: align,
      margin_left: margin_left,
      margin_right: margin_right,
      indent: indent,
      leading: leading,
      variable_name: variable_name,
      text: text,
    })
  )
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
  let (input, font_name) = length_value!(input, parse_u8, parse_block_c_string)?;
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

pub fn parse_define_font4(_input: &[u8]) -> IResult<&[u8], ast::tags::DefineFont> {
  unimplemented!()
}

pub fn parse_define_font_align_zones<P>(
  input: &[u8],
  glyph_count_provider: P,
) -> IResult<&[u8], ast::tags::DefineFontAlignZones>
where
  P: Fn(usize) -> Option<usize>,
{
  do_parse!(
    input,
    font_id: map!(parse_le_u16, |x| x as usize) >>
    // TODO(demurgos): Learn how to return errors and return an error if the glyph count is not found (instead of silently using default!)
    glyph_count: map!(value!(glyph_count_provider(font_id)), |glyph_count_opt| glyph_count_opt.unwrap_or_default()) >>
    csm_table_hint: bits!(parse_csm_table_hint_bits) >>
    zones:  length_count!(value!(glyph_count), parse_font_alignment_zone) >>
    (ast::tags::DefineFontAlignZones {
      font_id: font_id as u16,
      csm_table_hint: csm_table_hint,
      zones: zones,
    })
  )
}

pub fn parse_define_font_info(input: &[u8]) -> IResult<&[u8], ast::tags::DefineFontInfo> {
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
  let (input, font_name) = length_value!(input, parse_u8, parse_block_c_string)?;
  let (input, flags) = parse_u8(input)?;
  let use_wide_codes = (flags & (1 << 0)) != 0;
  let is_bold = (flags & (1 << 1)) != 0;
  let is_italic = (flags & (1 << 2)) != 0;
  let is_ansi = (flags & (1 << 3)) != 0;
  let is_shift_jis = (flags & (1 << 4)) != 0;
  let is_small = (flags & (1 << 5)) != 0;
  let language = ast::LanguageCode::Auto;
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

pub fn parse_define_font_info2(_input: &[u8]) -> IResult<&[u8], ast::tags::DefineFontInfo> {
  unimplemented!()
}

pub fn parse_define_font_name(input: &[u8]) -> IResult<&[u8], ast::tags::DefineFontName> {
  do_parse!(
    input,
    font_id: parse_le_u16
      >> name: parse_c_string
      >> copyright: parse_c_string
      >> (ast::tags::DefineFontName {
        font_id: font_id,
        name: name,
        copyright: copyright,
      })
  )
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

pub fn parse_define_scaling_grid(_input: &[u8]) -> IResult<&[u8], ()> {
  unimplemented!()
}

pub fn parse_define_scene_and_frame_label_data_tag(
  input: &[u8],
) -> IResult<&[u8], ast::tags::DefineSceneAndFrameLabelData> {
  do_parse!(
    input,
    scene_count: parse_leb128_u32
      >> scenes:
        fold_many_m_n!(
          scene_count as usize,
          scene_count as usize,
          pair!(parse_leb128_u32, parse_c_string),
          Vec::new(),
          |mut acc: Vec<_>, (offset, name)| {
            acc.push(ast::tags::Scene {
              offset: offset,
              name: name,
            });
            acc
          }
        )
      >> label_count: parse_leb128_u32
      >> labels:
        fold_many_m_n!(
          label_count as usize,
          label_count as usize,
          pair!(parse_leb128_u32, parse_c_string),
          Vec::new(),
          |mut acc: Vec<_>, (frame, name)| {
            acc.push(ast::tags::Label {
              frame: frame,
              name: name,
            });
            acc
          }
        )
      >> (ast::tags::DefineSceneAndFrameLabelData {
        scenes: scenes,
        labels: labels,
      })
  )
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
  do_parse!(
    input,
    id: parse_le_u16
      >> flags: parse_u8
      >> sound_type:
        switch!(value!((flags & (1 << 0)) != 0),
          true => value!(ast::SoundType::Stereo) |
          false => value!(ast::SoundType::Mono)
        )
      >> sound_size:
        switch!(value!((flags & (1 << 1)) != 0),
          true => value!(ast::SoundSize::SoundSize16) |
          false => value!(ast::SoundSize::SoundSize8)
        )
      >> sound_rate: map!(value!((flags >> 2) & 0b11), sound_rate_from_id)
      >> format: map!(value!((flags >> 4) & 0b1111), audio_coding_format_from_id)
      >> sample_count: parse_le_u32
      >> data: parse_bytes
      >> (ast::tags::DefineSound {
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
      })
  )
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
  use nom::combinator::map;

  let (input, id) = parse_le_u16(input)?;
  let (input, bounds) = parse_rect(input)?;
  let (input, matrix) = parse_matrix(input)?;
  let (input, index_bits) = map(parse_u8, |x| x as usize)(input)?;
  let (input, advance_bits) = map(parse_u8, |x| x as usize)(input)?;
  let (input, records) = parse_text_record_string(input, false, index_bits, advance_bits)?;

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

pub fn parse_define_text2(_input: &[u8]) -> IResult<&[u8], ast::tags::DefineText> {
  unimplemented!()
}

pub fn parse_define_video_stream(_input: &[u8]) -> IResult<&[u8], ()> {
  unimplemented!()
}

pub fn parse_do_abc(input: &[u8]) -> IResult<&[u8], ast::tags::DoAbc> {
  let (input, flags) = parse_le_u32(input)?;
  let (input, name) = parse_c_string(input)?;
  let (input, data) = (&[][..], input.to_vec());
  let tag = ast::tags::DoAbc { flags, name, data };
  Ok((input, tag))
}

pub fn parse_do_action(input: &[u8]) -> IResult<&[u8], ast::tags::DoAction> {
  Ok((
    &[][..],
    ast::tags::DoAction {
      actions: input.to_vec(),
    },
  ))
}

pub fn parse_do_init_action(input: &[u8]) -> IResult<&[u8], ast::tags::DoInitAction> {
  let (input, sprite_id) = parse_le_u16(input)?;
  let (input, actions) = (&[][..], input.to_vec());
  let tag = ast::tags::DoInitAction { sprite_id, actions };
  Ok((input, tag))
}

pub fn parse_enable_debugger(_input: &[u8]) -> IResult<&[u8], ast::tags::EnableDebugger> {
  unimplemented!()
}

pub fn parse_enable_debugger2(_input: &[u8]) -> IResult<&[u8], ast::tags::EnableDebugger> {
  unimplemented!()
}

pub fn parse_enable_telemetry(_input: &[u8]) -> IResult<&[u8], ()> {
  unimplemented!()
}

pub fn parse_export_assets(input: &[u8]) -> IResult<&[u8], ast::tags::ExportAssets> {
  do_parse!(
    input,
    assets: length_count!(parse_le_u16, parse_named_id) >> (ast::tags::ExportAssets { assets: assets })
  )
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
  do_parse!(
    input,
    url: parse_c_string
      >> assets: length_count!(parse_le_u16, parse_named_id)
      >> (ast::tags::ImportAssets {
        url: url,
        assets: assets,
      })
  )
}

#[allow(unused_variables)]
pub fn parse_import_assets2(input: &[u8]) -> IResult<&[u8], ast::tags::ImportAssets> {
  do_parse!(
    input,
    url: parse_c_string >>
    // TODO: Find how to use anonymous variable `_` to solve the unused_variables warning
    skipped: take!(2) >>
    assets: length_count!(parse_le_u16, parse_named_id) >>
    (ast::tags::ImportAssets {
      url: url,
      assets: assets,
    })
  )
}

pub fn parse_metadata(input: &[u8]) -> IResult<&[u8], ast::tags::Metadata> {
  do_parse!(
    input,
    metadata: parse_c_string >> (ast::tags::Metadata { metadata: metadata })
  )
}

pub fn parse_place_object(input: &[u8]) -> IResult<&[u8], ast::tags::PlaceObject> {
  fn has_available_input(input: &[u8]) -> IResult<&[u8], bool> {
    return Ok((input, input.len() > 0));
  }

  do_parse!(
    input,
    character_id: parse_le_u16
      >> depth: parse_le_u16
      >> matrix: parse_matrix
      >> has_color_transform: has_available_input
      >> color_transform:
        cond!(
          has_color_transform,
          map!(parse_color_transform, |color_transform| ast::ColorTransformWithAlpha {
            red_mult: color_transform.red_mult,
            green_mult: color_transform.green_mult,
            blue_mult: color_transform.blue_mult,
            alpha_mult: ::swf_fixed::Sfixed8P8::ONE,
            red_add: color_transform.red_add,
            green_add: color_transform.green_add,
            blue_add: color_transform.blue_add,
            alpha_add: 0,
          })
        )
      >> (ast::tags::PlaceObject {
        is_update: false,
        depth: depth,
        character_id: Option::Some(character_id),
        matrix: Option::Some(matrix),
        color_transform: color_transform,
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
      })
  )
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
      is_update: is_update,
      depth: depth,
      character_id: character_id,
      matrix: matrix,
      color_transform: color_transform,
      ratio: ratio,
      name: name,
      class_name: None,
      clip_depth: clip_depth,
      filters: None,
      blend_mode: None,
      bitmap_cache: None,
      visible: None,
      background_color: None,
      clip_actions: clip_actions,
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
  do_parse!(
    input,
    password: parse_block_c_string >> (ast::tags::Protect { password })
  )
}

pub fn parse_remove_object(input: &[u8]) -> IResult<&[u8], ast::tags::RemoveObject> {
  do_parse!(
    input,
    character_id: parse_le_u16
      >> depth: parse_le_u16
      >> (ast::tags::RemoveObject {
        character_id: Option::Some(character_id),
        depth: depth,
      })
  )
}

pub fn parse_remove_object2(input: &[u8]) -> IResult<&[u8], ast::tags::RemoveObject> {
  do_parse!(
    input,
    depth: parse_le_u16
      >> (ast::tags::RemoveObject {
        character_id: Option::None,
        depth: depth,
      })
  )
}

pub fn parse_script_limits(input: &[u8]) -> IResult<&[u8], ast::tags::ScriptLimits> {
  do_parse!(
    input,
    max_recursion_depth: parse_le_u16
      >> script_timeout: parse_le_u16
      >> (ast::tags::ScriptLimits {
        max_recursion_depth,
        script_timeout,
      })
  )
}

pub fn parse_set_background_color_tag(input: &[u8]) -> IResult<&[u8], ast::tags::SetBackgroundColor> {
  do_parse!(
    input,
    color: parse_s_rgb8 >> (ast::tags::SetBackgroundColor { color: color })
  )
}

pub fn parse_set_tab_index(_input: &[u8]) -> IResult<&[u8], ()> {
  unimplemented!()
}

fn parse_sound_stream_block(input: &[u8]) -> IResult<&[u8], ast::tags::SoundStreamBlock> {
  do_parse!(input, data: parse_bytes >> (ast::tags::SoundStreamBlock { data }))
}

fn parse_sound_stream_head(input: &[u8]) -> IResult<&[u8], ast::tags::SoundStreamHead> {
  parse_sound_stream_head_any(input)
}

fn parse_sound_stream_head2(input: &[u8]) -> IResult<&[u8], ast::tags::SoundStreamHead> {
  parse_sound_stream_head_any(input)
}

fn parse_sound_stream_head_any(input: &[u8]) -> IResult<&[u8], ast::tags::SoundStreamHead> {
  do_parse!(
    input,
    flags: parse_le_u16  >>
    playback_sound_type: switch!(value!((flags & (1 << 0)) != 0),
      true => value!(ast::SoundType::Stereo) |
      false => value!(ast::SoundType::Mono)
    )  >>
    playback_sound_size: switch!(value!((flags & (1 << 1)) != 0),
      true => value!(ast::SoundSize::SoundSize16) |
      false => value!(ast::SoundSize::SoundSize8)
    )  >>
    playback_sound_rate: map!(value!(((flags >> 2) & 0b11) as u8), sound_rate_from_id) >>
    // Bits [4,7] are reserved
    stream_sound_type: switch!(value!((flags & (1 << 8)) != 0),
      true => value!(ast::SoundType::Stereo) |
      false => value!(ast::SoundType::Mono)
    )  >>
    stream_sound_size: switch!(value!((flags & (1 << 9)) != 0),
      true => value!(ast::SoundSize::SoundSize16) |
      false => value!(ast::SoundSize::SoundSize8)
    )  >>
    stream_sound_rate: map!(value!(((flags >> 10) & 0b11) as u8), sound_rate_from_id) >>
    stream_format: map!(value!(((flags >> 12) & 0b1111) as u8), audio_coding_format_from_id) >>
    stream_sample_count: parse_le_u16 >>
    latency_seek: cond!(stream_format == ast::AudioCodingFormat::Mp3, parse_le_i16) >>
    (ast::tags::SoundStreamHead {
      playback_sound_type,
      playback_sound_size,
      playback_sound_rate,
      stream_sound_type,
      stream_sound_size: if is_uncompressed_audio_coding_format(&stream_format) { stream_sound_size } else { ast::SoundSize::SoundSize16 },
      stream_sound_rate,
      stream_format,
      stream_sample_count,
      latency_seek,
    })
  )
}

pub fn parse_start_sound(input: &[u8]) -> IResult<&[u8], ast::tags::StartSound> {
  do_parse!(
    input,
    sound_id: parse_le_u16 >> sound_info: parse_sound_info >> (ast::tags::StartSound { sound_id, sound_info })
  )
}

pub fn parse_start_sound2(input: &[u8]) -> IResult<&[u8], ast::tags::StartSound2> {
  do_parse!(
    input,
    sound_class_name: parse_c_string
      >> sound_info: parse_sound_info
      >> (ast::tags::StartSound2 {
        sound_class_name,
        sound_info,
      })
  )
}

pub fn parse_symbol_class(input: &[u8]) -> IResult<&[u8], ast::tags::SymbolClass> {
  do_parse!(
    input,
    symbols: length_count!(parse_le_u16, parse_named_id) >> (ast::tags::SymbolClass { symbols })
  )
}

pub fn parse_video_frame(_input: &[u8]) -> IResult<&[u8], ()> {
  unimplemented!()
}
