use swf_tree as ast;
use nom::{IResult, Needed};
use nom::{le_u8 as parse_u8, le_u16 as parse_le_u16, le_u32 as parse_le_u32};
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
  parse_rgb,
  skip_bits
};
use parsers::shapes::{parse_shape};
use parsers::swf_file::parse_swf_tags_string;
use parsers::text::{parse_font_layout, parse_offset_glyphs};

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

pub fn parse_swf_tag(input: &[u8]) -> IResult<&[u8], ast::Tag> {
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
          9 => map!(record_data, parse_set_background_color_tag, |t| ast::Tag::SetBackgroundColor(t)),
          // TODO: Ignore DoAction if version >= 9 && use_as3
          12 => map!(record_data, parse_do_action_tag, |t| ast::Tag::DoAction(t)),
          26 => map!(record_data, parse_place_object2, |t| ast::Tag::PlaceObject(t)),
          39 => map!(record_data, parse_define_sprite, |t| ast::Tag::DefineSprite(t)),
          56 => map!(record_data, parse_export_assets, |t| ast::Tag::ExportAssets(t)),
          // TODO: 59 => DoInitAction
          69 => map!(record_data, parse_file_attributes_tag, |t| ast::Tag::FileAttributes(t)),
          75 => map!(record_data, parse_define_font3, |t| ast::Tag::DefineFont(t)),
          77 => map!(record_data, parse_metadata, |t| ast::Tag::Metadata(t)),
          86 => map!(record_data, parse_define_scene_and_frame_label_data_tag, |t| ast::Tag::DefineSceneAndFrameLabelData(t)),
          _ => {
            IResult::Done(&[][..], ast::Tag::Unknown(ast::tags::Unknown { code: rh.tag_code, data: record_data.to_vec() }))
          }
        };
        match record_result {
          // IResult::Done(left, o) => {
          //   println!("{:?}", left);
          //   IResult::Done(remaining_input, o)
          // }
          IResult::Done(_, o) => IResult::Done(remaining_input, o),
          IResult::Error(e) => IResult::Error(e),
          IResult::Incomplete(n) => IResult::Incomplete(n),
        }
      }
    }
    IResult::Error(e) => IResult::Error(e),
    IResult::Incomplete(n) => IResult::Incomplete(n),
  }
}

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

// https://github.com/mozilla/shumway/blob/16451d8836fa85f4b16eeda8b4bda2fa9e2b22b0/src/swf/parser/module.ts#L632
named!(
  pub parse_define_font3<&[u8], ast::tags::DefineFont, u32>,
  do_parse!(
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
);

named!(
  pub parse_define_scene_and_frame_label_data_tag<ast::tags::DefineSceneAndFrameLabelData>,
  do_parse!(
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
    (
      ast::tags::DefineSceneAndFrameLabelData {
      scenes: scenes,
      labels: labels,
    })
  )
);

named!(
  pub parse_define_shape<ast::tags::DefineShape>,
  do_parse!(
    id: parse_le_u16 >>
    bounds: parse_rect >>
    shape: parse_shape >>
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
);

named!(
  pub parse_define_sprite<ast::tags::DefineSprite>,
  do_parse!(
    id: parse_le_u16 >>
    frame_count: parse_le_u16 >>
    tags: parse_swf_tags_string >>
    (ast::tags::DefineSprite {
      id: id,
      frame_count: frame_count as usize,
      tags: tags,
    })
  )
);

/// Parse a DoAction tag (code: 12)
named!(
  pub parse_do_action_tag<ast::tags::DoAction>,
  map!(
    parse_actions_string,
    |actions| ast::tags::DoAction {actions: actions}
  )
);

named!(
  pub parse_export_assets<ast::tags::ExportAssets>,
  do_parse!(
    assets: length_count!(parse_le_u16, parse_named_id) >>
    (ast::tags::ExportAssets {
      assets: assets,
    })
  )
);

named!(
  pub parse_file_attributes_tag<ast::tags::FileAttributes>,
  bits!(
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
);

named!(
  pub parse_metadata<ast::tags::Metadata>,
  do_parse!(
    metadata: parse_c_string >>
    (
      ast::tags::Metadata {
      metadata: metadata,
    })
  )
);

struct PlaceObject2Flags {
  pub has_clip_actions: bool,
  pub has_clip_depth: bool,
  pub has_name: bool,
  pub has_ratio: bool,
  pub has_color_transform: bool,
  pub has_matrix: bool,
  pub has_character: bool,
  pub is_move: bool,
}

named!(
  pub parse_place_object2<ast::tags::PlaceObject>,
  do_parse!(
    flags: bits!(do_parse!(
      has_clip_actions: call!(parse_bool_bits) >>
      has_clip_depth: call!(parse_bool_bits) >>
      has_name: call!(parse_bool_bits) >>
      has_ratio: call!(parse_bool_bits) >>
      has_color_transform: call!(parse_bool_bits) >>
      has_matrix: call!(parse_bool_bits) >>
      has_character: call!(parse_bool_bits) >>
      is_move: call!(parse_bool_bits) >>
      (PlaceObject2Flags {
        has_clip_actions: has_clip_actions,
        has_clip_depth: has_clip_depth,
        has_name: has_name,
        has_ratio: has_ratio,
        has_color_transform: has_color_transform,
        has_matrix: has_matrix,
        has_character: has_character,
        is_move: is_move,
      })
    )) >>
    depth: parse_le_u16 >>
    character_id: cond!(flags.has_character, parse_le_u16) >>
    matrix: cond!(flags.has_matrix, parse_matrix) >>
    color_transform: cond!(flags.has_color_transform, parse_color_transform_with_alpha) >>
    ratio: cond!(flags.has_ratio, parse_le_u16) >>
    name: cond!(flags.has_name, parse_c_string) >>
    clip_depth: cond!(flags.has_clip_depth, parse_le_u16) >>
    (ast::tags::PlaceObject {
      depth: depth,
      character_id: character_id,
      matrix: matrix,
      color_transform: color_transform,
      ratio: ratio,
      name: name,
      class_name: Option::None,
      clip_depth: clip_depth,
      filters: vec!(),
      blend_mode: Option::None,
      bitmap_cache: Option::None,
      visible: Option::None,
      background_color: Option::None,
      clip_actions: vec!(),
    })
  )
);

/// Parse a SetBackgroundColor tag (code: 9)
named!(
  pub parse_set_background_color_tag<ast::tags::SetBackgroundColor>,
  do_parse!(
    color: parse_rgb >>
    (ast::tags::SetBackgroundColor {
      color: color,
    })
  )
);
