use swf_tree as ast;
use nom::{IResult, Needed};
use nom::{be_u16 as parse_be_u16, le_u8 as parse_u8, le_i16 as parse_le_i16, le_u16 as parse_le_u16, le_u32 as parse_le_u32, be_f32 as parse_be_f32};
use ordered_float::OrderedFloat;
use parsers::avm1::parse_actions_string;
use parsers::basic_data_types::{
  parse_bool_bits,
  parse_c_string,
  parse_color_transform_with_alpha,
  parse_encoded_le_u32,
  parse_language_code,
  parse_matrix,
  parse_named_id,
  parse_rect,
  parse_s_rgb8,
  parse_straight_s_rgba8,
  skip_bits
};
use parsers::display::{parse_blend_mode, parse_clip_actions_string, parse_filter_list};
use parsers::shapes::{parse_shape, ShapeVersion};
use parsers::movie::parse_tag_string;
use parsers::text::{parse_csm_table_hint_bits, parse_font_alignment_zone, parse_font_layout, parse_grid_fitting_bits, parse_offset_glyphs, parse_text_alignment, parse_text_record_string, parse_text_renderer_bits};
use state::ParseState;

pub struct SwfTagHeader {
  pub tag_code: u16,
  pub length: usize,
}

fn parse_swf_tag_header(input: &[u8]) -> IResult<&[u8], SwfTagHeader> {
  match parse_le_u16(input) {
    IResult::Done(remaining_input, code_and_length) => {
      let code = code_and_length >> 6;
      let max_length = (1 << 6) - 1;
      let length = code_and_length & max_length;
      if length < max_length {
        IResult::Done(remaining_input, SwfTagHeader { tag_code: code, length: length as usize })
      } else {
        map!(remaining_input, parse_le_u32, |long_length| SwfTagHeader { tag_code: code, length: long_length as usize })
      }
    }
    IResult::Error(e) => IResult::Error(e),
    IResult::Incomplete(n) => IResult::Incomplete(n),
  }
}

pub fn parse_swf_tag<'a>(input: &'a [u8], state: &mut ParseState) -> IResult<&'a [u8], ast::Tag> {
  match parse_swf_tag_header(input) {
    IResult::Done(remaining_input, rh) => {
      if remaining_input.len() < rh.length {
        let record_header_length = input.len() - remaining_input.len();
        IResult::Incomplete(Needed::Size(record_header_length + rh.length))
      } else {
        let record_data: &[u8] = &remaining_input[..rh.length];
        let remaining_input: &[u8] = &remaining_input[rh.length..];
        let record_result = match rh.tag_code {
          1 => IResult::Done(&record_data[rh.length..], ast::Tag::ShowFrame),
          2 => map!(record_data, parse_define_shape, |t| ast::Tag::DefineShape(t)),
          4 => map!(record_data, parse_place_object, |t| ast::Tag::PlaceObject(t)),
          5 => map!(record_data, parse_remove_object, |t| ast::Tag::RemoveObject(t)),
          9 => map!(record_data, parse_set_background_color_tag, |t| ast::Tag::SetBackgroundColor(t)),
          11 => map!(record_data, parse_define_text, |t| ast::Tag::DefineText(t)),
          // TODO: Ignore DoAction if version >= 9 && use_as3
          12 => map!(record_data, parse_do_action, |t| ast::Tag::DoAction(t)),
          22 => map!(record_data, parse_define_shape2, |t| ast::Tag::DefineShape(t)),
          // TODO(demurgos): Throw error if the version is unknown
          26 => map!(record_data, apply!(parse_place_object2, state.get_swf_version().unwrap_or_default() >= 6), |t| ast::Tag::PlaceObject(t)),
          28 => map!(record_data, parse_remove_object2, |t| ast::Tag::RemoveObject(t)),
          32 => map!(record_data, parse_define_shape3, |t| ast::Tag::DefineShape(t)),
          37 => map!(record_data, parse_define_edit_text, |t| ast::Tag::DefineDynamicText(t)),
          39 => map!(record_data, parse_define_sprite, |t| ast::Tag::DefineSprite(t)),
          56 => map!(record_data, parse_export_assets, |t| ast::Tag::ExportAssets(t)),
          57 => map!(record_data, parse_import_assets, |t| ast::Tag::ImportAssets(t)),
          59 => map!(record_data, parse_do_init_action, |t| ast::Tag::DoInitAction(t)),
          69 => map!(record_data, parse_file_attributes_tag, |t| ast::Tag::FileAttributes(t)),
          // TODO(demurgos): Throw error if the version is unknown
          70 => map!(record_data, apply!(parse_place_object3, state.get_swf_version().unwrap_or_default() >= 6), |t| ast::Tag::PlaceObject(t)),
          71 => map!(record_data, parse_import_assets2, |t| ast::Tag::ImportAssets(t)),
          73 => map!(record_data, apply!(parse_define_font_align_zones, |font_id| state.get_glyph_count(font_id)), |t| ast::Tag::DefineFontAlignZones(t)),
          74 => map!(record_data, parse_csm_text_settings, |t| ast::Tag::CsmTextSettings(t)),
          75 => map!(record_data, parse_define_font3, |t| ast::Tag::DefineFont(t)),
          77 => map!(record_data, parse_metadata, |t| ast::Tag::Metadata(t)),
          86 => map!(record_data, parse_define_scene_and_frame_label_data_tag, |t| ast::Tag::DefineSceneAndFrameLabelData(t)),
          88 => map!(record_data, parse_define_font_name, |t| ast::Tag::DefineFontName(t)),
          _ => {
            IResult::Done(&[][..], ast::Tag::Unknown(ast::tags::Unknown { code: rh.tag_code, data: record_data.to_vec() }))
          }
        };
        match record_result {
          IResult::Done(_, output_tag) => {
            match output_tag {
              ast::Tag::DefineFont(ref tag) => {
                match tag.glyphs {
                  Some(ref glyphs) => state.set_glyph_count(tag.id as usize, glyphs.len()),
                  None => state.set_glyph_count(tag.id as usize, 0),
                };
              }
              _ => (),
            };
            IResult::Done(remaining_input, output_tag)
          }
          IResult::Error(e) => IResult::Error(e),
          IResult::Incomplete(n) => IResult::Incomplete(n),
        }
      }
    }
    IResult::Error(e) => IResult::Error(e),
    IResult::Incomplete(n) => IResult::Incomplete(n),
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
    thickness: map!(parse_be_f32, |x| OrderedFloat::<f32>(x)) >>
    sharpness: map!(parse_be_f32, |x| OrderedFloat::<f32>(x)) >>
    (ast::tags::CsmTextSettings {
      text_id: text_id,
      renderer: renderer_and_fitting.0,
      fitting: renderer_and_fitting.1,
      thickness: thickness,
      sharpness: sharpness,
    })
  )
}

pub fn parse_define_edit_text(input: &[u8]) -> IResult<&[u8], ast::tags::DefineDynamicText> {
  do_parse!(
    input,
    id: parse_le_u16 >>
    bounds: parse_rect >>

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
    align: cond!(has_layout, parse_text_alignment) >>
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

// https://github.com/mozilla/shumway/blob/16451d8836fa85f4b16eeda8b4bda2fa9e2b22b0/src/swf/parser/module.ts#L632
#[allow(unused_variables)]
pub fn parse_define_font3(input: &[u8]) -> IResult<&[u8], ast::tags::DefineFont> {
  struct DefineFont3Flags {
    has_layout: bool,
    is_shift_jis: bool,
    is_ansi: bool,
    is_small: bool,
    use_wide_offsets: bool,
    use_wide_codes: bool,
    is_italic: bool,
    is_bold: bool,
  }

  do_parse!(
    input,
    id: parse_le_u16 >>
    flags: bits!(do_parse!(
      has_layout: call!(parse_bool_bits) >>
      is_shift_jis: call!(parse_bool_bits) >>
      is_ansi: call!(parse_bool_bits) >>
      is_small: call!(parse_bool_bits) >>
      use_wide_offsets: call!(parse_bool_bits) >>
      use_wide_codes: call!(parse_bool_bits) >>
      is_italic: call!(parse_bool_bits) >>
      is_bold: call!(parse_bool_bits) >>
      (DefineFont3Flags {
        has_layout: has_layout,
        is_shift_jis: is_shift_jis,
        is_ansi: is_ansi,
        is_small: is_small,
        use_wide_offsets: use_wide_offsets,
        use_wide_codes: use_wide_codes,
        is_italic: is_italic,
        is_bold: is_bold,
      })
    )) >>
    language: parse_language_code >>
    font_name: length_value!(parse_u8, parse_c_string) >>
    glyph_count: parse_le_u16 >>
    // TODO: if glyphCount == 0, the remaining should be Option::None
    glyphs: apply!(parse_offset_glyphs, glyph_count as usize, flags.use_wide_offsets) >>
    code_units: switch!(value!(flags.use_wide_codes),
      true => length_count!(value!(glyph_count), parse_le_u16) |
      false => length_count!(value!(glyph_count), map!(parse_u8, |x| x as u16))
    )  >>
    layout: cond!(flags.has_layout, apply!(parse_font_layout, glyph_count as usize)) >>
    (ast::tags::DefineFont {
      id: id,
      font_name: font_name,
      is_small: flags.is_small,
      is_shift_jis: flags.is_shift_jis,
      is_ansi: flags.is_ansi,
      is_italic: flags.is_italic,
      is_bold: flags.is_bold,
      language: language,
      glyphs: Option::Some(glyphs),
      code_units: Option::Some(code_units),
      layout: layout,
    })
  )
}

pub fn parse_define_font_align_zones<P>(input: &[u8], glyph_count_provider: P) -> IResult<&[u8], ast::tags::DefineFontAlignZones>
  where P: Fn(usize) -> Option<usize> {
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

pub fn parse_define_font_name(input: &[u8]) -> IResult<&[u8], ast::tags::DefineFontName> {
  do_parse!(
    input,
    font_id: parse_le_u16 >>
    name: parse_c_string >>
    copyright: parse_c_string >>
    (ast::tags::DefineFontName {
      font_id: font_id,
      name: name,
      copyright: copyright,
    })
  )
}

pub fn parse_define_scene_and_frame_label_data_tag(input: &[u8]) -> IResult<&[u8], ast::tags::DefineSceneAndFrameLabelData> {
  do_parse!(
    input,
    scene_count: parse_encoded_le_u32 >>
    scenes: fold_many_m_n!(
      scene_count as usize,
      scene_count as usize,
      pair!(parse_encoded_le_u32, parse_c_string),
      Vec::new(),
      |mut acc: Vec<_>, (offset, name)| {
        acc.push(ast::tags::Scene {offset: offset, name: name});
        acc
      }
    ) >>
    label_count: parse_encoded_le_u32 >>
    labels: fold_many_m_n!(
      label_count as usize,
      label_count as usize,
      pair!(parse_encoded_le_u32, parse_c_string),
      Vec::new(),
      |mut acc: Vec<_>, (frame, name)| {
        acc.push(ast::tags::Label {frame: frame, name: name});
        acc
      }
    ) >>
    (ast::tags::DefineSceneAndFrameLabelData {
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

fn parse_define_shape_any(input: &[u8], version: ShapeVersion) -> IResult<&[u8], ast::tags::DefineShape> {
  do_parse!(
    input,
    id: parse_le_u16 >>
    bounds: parse_rect >>
    shape: apply!(parse_shape, version) >>
    (ast::tags::DefineShape {
      id: id,
      bounds: bounds,
      edge_bounds: Option::None,
      has_fill_winding: false,
      has_non_scaling_strokes: false,
      has_scaling_strokes: false,
      shape: shape,
    })
  )
}

pub fn parse_define_sprite(input: &[u8]) -> IResult<&[u8], ast::tags::DefineSprite> {
  do_parse!(
    input,
    id: parse_le_u16 >>
    frame_count: parse_le_u16 >>
    tags: parse_tag_string >>
    (ast::tags::DefineSprite {
      id: id,
      frame_count: frame_count as usize,
      tags: tags,
    })
  )
}

pub fn parse_define_text(input: &[u8]) -> IResult<&[u8], ast::tags::DefineText> {
  do_parse!(
    input,
    id: parse_le_u16 >>
    bounds: parse_rect >>
    matrix: parse_matrix >>
    index_bits: map!(parse_u8, |x| x as usize) >>
    advance_bits: map!(parse_u8, |x| x as usize) >>
    records: apply!(parse_text_record_string, false, index_bits, advance_bits) >>
    (ast::tags::DefineText {
      id: id,
      bounds: bounds,
      matrix: matrix,
      records: records,
    })
  )
}

pub fn parse_do_action(input: &[u8]) -> IResult<&[u8], ast::tags::DoAction> {
  map!(
    input,
    parse_actions_string,
    |actions| ast::tags::DoAction {actions: actions}
  )
}

pub fn parse_do_init_action(input: &[u8]) -> IResult<&[u8], ast::tags::DoInitAction> {
  do_parse!(
    input,
    sprite_id: parse_le_u16 >>
    actions: parse_actions_string >>
    (ast::tags::DoInitAction {
      sprite_id: sprite_id,
      actions: actions,
    })
  )
}

pub fn parse_export_assets(input: &[u8]) -> IResult<&[u8], ast::tags::ExportAssets> {
  do_parse!(
    input,
    assets: length_count!(parse_le_u16, parse_named_id) >>
    (ast::tags::ExportAssets {
      assets: assets,
    })
  )
}

pub fn parse_file_attributes_tag(input: &[u8]) -> IResult<&[u8], ast::tags::FileAttributes> {
  bits!(
    input,
    do_parse!(
      apply!(skip_bits, 1) >>
      use_direct_blit: call!(parse_bool_bits) >>
      use_gpu: call!(parse_bool_bits) >>
      has_metadata: call!(parse_bool_bits) >>
      use_as3: call!(parse_bool_bits) >>
      no_cross_domain_caching: call!(parse_bool_bits) >> // Not in the spec, found in Shumway
      use_relative_urls: call!(parse_bool_bits) >> // Not in the spec, found in Shumway
      use_network: call!(parse_bool_bits) >>
      apply!(skip_bits, 24) >>
      (ast::tags::FileAttributes {
        use_direct_blit: use_direct_blit,
        use_gpu: use_gpu,
        has_metadata: has_metadata,
        use_as3: use_as3,
        no_cross_domain_caching: no_cross_domain_caching,
        use_relative_urls: use_relative_urls,
        use_network: use_network,
      })
    )
  )
}

pub fn parse_import_assets(input: &[u8]) -> IResult<&[u8], ast::tags::ImportAssets> {
  do_parse!(
    input,
    url: parse_c_string >>
    assets: length_count!(parse_le_u16, parse_named_id) >>
    (ast::tags::ImportAssets {
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
    metadata: parse_c_string >>
    (ast::tags::Metadata {
      metadata: metadata,
    })
  )
}

pub fn parse_place_object(input: &[u8]) -> IResult<&[u8], ast::tags::PlaceObject> {
  fn has_available_input(input: &[u8]) -> IResult<&[u8], bool> {
    return IResult::Done(input, input.len() > 0);
  }

  do_parse!(
    input,
    character_id: parse_le_u16 >>
    depth: parse_le_u16 >>
    matrix: parse_matrix >>
    has_color_transform: has_available_input >>
    color_transform: cond!(
      has_color_transform,
      map!(
        parse_color_transform_with_alpha,
        |color_transform| ast::ColorTransformWithAlpha {
          red_mult: color_transform.red_mult,
          green_mult: color_transform.green_mult,
          blue_mult: color_transform.blue_mult,
          alpha_mult: ast::fixed_point::Fixed8P8::from_epsilons(1 << 8),
          red_add: color_transform.red_add,
          green_add: color_transform.green_add,
          blue_add: color_transform.blue_add,
          alpha_add: 0,
        }
      )
    ) >>
    (ast::tags::PlaceObject {
      is_move: false,
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

pub fn parse_place_object2(input: &[u8], extended_events: bool) -> IResult<&[u8], ast::tags::PlaceObject> {
  do_parse!(
    input,
    flags: parse_u8 >>
    has_clip_actions: value!((flags & (1 << 7)) != 0) >>
    has_clip_depth: value!((flags & (1 << 6)) != 0) >>
    has_name: value!((flags & (1 << 5)) != 0) >>
    has_ratio: value!((flags & (1 << 4)) != 0) >>
    has_color_transform: value!((flags & (1 << 3)) != 0) >>
    has_matrix: value!((flags & (1 << 2)) != 0) >>
    has_character_id: value!((flags & (1 << 1)) != 0) >>
    is_move: value!((flags & (1 << 0)) != 0) >>
    depth: parse_le_u16 >>
    character_id: cond!(has_character_id, parse_le_u16) >>
    matrix: cond!(has_matrix, parse_matrix) >>
    color_transform: cond!(has_color_transform, parse_color_transform_with_alpha) >>
    ratio: cond!(has_ratio, parse_le_u16) >>
    name: cond!(has_name, parse_c_string) >>
    clip_depth: cond!(has_clip_depth, parse_le_u16) >>
    clip_actions: cond!(has_clip_actions, apply!(parse_clip_actions_string, extended_events)) >>
    (ast::tags::PlaceObject {
      is_move: is_move,
      depth: depth,
      character_id: character_id,
      matrix: matrix,
      color_transform: color_transform,
      ratio: ratio,
      name: name,
      class_name: Option::None,
      clip_depth: clip_depth,
      filters: Option::None,
      blend_mode: Option::None,
      bitmap_cache: Option::None,
      visible: Option::None,
      background_color: Option::None,
      clip_actions: clip_actions,
    })
  )
}

pub fn parse_place_object3(input: &[u8], extended_events: bool) -> IResult<&[u8], ast::tags::PlaceObject> {
  do_parse!(
    input,
    flags: parse_be_u16 >>
    has_clip_actions: value!((flags & (1 << 15)) != 0) >>
    has_clip_depth: value!((flags & (1 << 14)) != 0) >>
    has_name: value!((flags & (1 << 13)) != 0) >>
    has_ratio: value!((flags & (1 << 12)) != 0) >>
    has_color_transform: value!((flags & (1 << 11)) != 0) >>
    has_matrix: value!((flags & (1 << 10)) != 0) >>
    has_character_id: value!((flags & (1 << 9)) != 0) >>
    is_move: value!((flags & (1 << 8)) != 0) >>
    has_background_color: value!((flags & (1 << 6)) != 0) >>
    has_visibility: value!((flags & (1 << 5)) != 0) >>
    has_image: value!((flags & (1 << 4)) != 0) >>
    has_class_name: value!((flags & (1 << 3)) != 0) >>
    has_cache_hint: value!((flags & (1 << 2)) != 0) >>
    has_blend_mode: value!((flags & (1 << 1)) != 0) >>
    has_filters: value!((flags & (1 << 0)) != 0) >>
    depth: parse_le_u16 >>
    class_name: cond!(has_class_name || (has_image && has_character_id), parse_c_string) >>
    character_id: cond!(has_character_id, parse_le_u16) >>
    matrix: cond!(has_matrix, parse_matrix) >>
    color_transform: cond!(has_color_transform, parse_color_transform_with_alpha) >>
    ratio: cond!(has_ratio, parse_le_u16) >>
    name: cond!(has_name, parse_c_string) >>
    clip_depth: cond!(has_clip_depth, parse_le_u16) >>
    filters: cond!(has_filters, parse_filter_list) >>
    blend_mode: cond!(has_blend_mode, parse_blend_mode) >>
    use_bitmap_cache: cond!(has_cache_hint, map!(parse_u8, |x| x != 0)) >>
    is_visible: cond!(has_visibility, map!(parse_u8, |x| x != 0)) >>
    // TODO(demurgos): Check if it is RGBA or ARGB
    background_color: cond!(has_background_color, parse_straight_s_rgba8) >>
    clip_actions: cond!(has_clip_actions, apply!(parse_clip_actions_string, extended_events)) >>
    (ast::tags::PlaceObject {
      is_move: is_move,
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
    })
  )
}

pub fn parse_remove_object(input: &[u8]) -> IResult<&[u8], ast::tags::RemoveObject> {
  do_parse!(
    input,
    character_id: parse_le_u16 >>
    depth: parse_le_u16 >>
    (ast::tags::RemoveObject {
      character_id: Option::Some(character_id),
      depth: depth,
    })
  )
}

pub fn parse_remove_object2(input: &[u8]) -> IResult<&[u8], ast::tags::RemoveObject> {
  do_parse!(
    input,
    depth: parse_le_u16 >>
    (ast::tags::RemoveObject {
      character_id: Option::None,
      depth: depth,
    })
  )
}

pub fn parse_set_background_color_tag(input: &[u8]) -> IResult<&[u8], ast::tags::SetBackgroundColor> {
  do_parse!(
    input,
    color: parse_s_rgb8 >>
    (ast::tags::SetBackgroundColor {
      color: color,
    })
  )
}
