use swf_tree as ast;
use nom::{IResult, Needed};
use nom::{le_u8 as parse_u8, le_u16 as parse_le_u16, le_u32 as parse_le_u32};
use parsers::avm1::parse_actions_string;
use parsers::basic_data_types::{
  parse_bool_bits,
  parse_c_string,
  parse_color_transform_with_alpha,
  parse_encoded_le_u32,
  parse_i32_bits,
  parse_matrix,
  parse_rect,
  parse_rgb,
  parse_u16_bits,
  skip_bits
};

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
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

/// Parse a DoAction tag (code: 12)
named!(
  pub parse_do_action_tag<ast::tags::DoAction>,
  map!(
    parse_actions_string,
    |actions| ast::tags::DoAction {actions: actions}
  )
);

/// Parse a FileAttributes tag (code: 69)
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

/// Parse a DefineSceneAndFrameLabelData tag (code: 86)
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

/// Parse a Metadata tag (code: 77)
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

pub fn parse_list_length(input: &[u8]) -> IResult<&[u8], usize> {
  match parse_u8(input) {
    IResult::Done(remaining_input, u8_len) => {
      if u8_len < 0xff {
        IResult::Done(remaining_input, u8_len as usize)
      } else {
        parse_le_u16(remaining_input)
          .map(|u16_len| u16_len as usize)
      }
    }
    IResult::Error(e) => IResult::Error(e),
    IResult::Incomplete(n) => IResult::Incomplete(n),
  }
}

named!(
  pub parse_line_style<ast::shapes::LineStyle>,
  do_parse!(
    width: parse_le_u16 >>
    color: parse_rgb >>
    (
      ast::shapes::LineStyle {
      width: width,
      start_cap: ast::shapes::CapStyle::Round,
      end_cap: ast::shapes::CapStyle::Round,
      join: ast::shapes::JoinStyle::Round,
      no_h_scale: false,
      no_v_scale: false,
      no_close: false,
      fill: ast::shapes::FillStyle::Solid(
        ast::shapes::fills::Solid {
          color: ast::StraightSRgba {
            r: color.r,
            g: color.g,
            b: color.b,
            a: 255
          }
        }
      ),
    })
  )
);

named!(
  pub parse_line_style_list<Vec<ast::shapes::LineStyle>>,
    length_count!(parse_list_length, parse_line_style)
);

named!(
  pub parse_solid_fill<ast::shapes::fills::Solid>,
  do_parse!(
    color: parse_rgb >>
    (
      ast::shapes::fills::Solid {
        color: ast::StraightSRgba {
          r: color.r,
          g: color.g,
          b: color.b,
          a: 255
        }
    })
  )
);

named!(parse_fill_style<&[u8], ast::shapes::FillStyle>,
  switch!(parse_u8,
   0x00 => map!(parse_solid_fill, |fill| ast::shapes::FillStyle::Solid(fill))
  )
);

#[derive(Clone)]
struct StyleChangeMoveTo {
  delta_x: i32,
  delta_y: i32,
}

pub fn parse_style_change_bits(input: (&[u8], usize), fill_style_bits: usize, line_style_bits: usize) -> IResult<(&[u8], usize), ast::shapes::StyleChange> {
  do_parse!(
    input,
    apply!(skip_bits, 1) >> // Type flag
    new_styles_flag: call!(parse_bool_bits) >>
    change_line_style_flag: call!(parse_bool_bits) >>
    change_right_fill_style_flag: call!(parse_bool_bits) >>
    change_left_fill_style_flag: call!(parse_bool_bits) >>
    move_to_flag: call!(parse_bool_bits) >>
    move_to: cond!(move_to_flag,
      do_parse!(
        move_to_bits: apply!(parse_u16_bits, 5) >>
        delta_x: apply!(parse_i32_bits, move_to_bits as usize) >>
        delta_y: apply!(parse_i32_bits, move_to_bits as usize) >>
        (StyleChangeMoveTo {delta_x: delta_x, delta_y: delta_y})
      )
    ) >>
    left_fill: cond!(change_left_fill_style_flag, apply!(parse_u16_bits, fill_style_bits)) >>
    right_fill: cond!(change_right_fill_style_flag, apply!(parse_u16_bits, fill_style_bits)) >>
    line_style: cond!(change_line_style_flag, apply!(parse_u16_bits, line_style_bits)) >>
    (ast::shapes::StyleChange {
        delta_x: move_to.clone().map(|move_to| move_to.delta_x).unwrap_or_default(),
        delta_y: move_to.map(|move_to| move_to.delta_y).unwrap_or_default(),
        left_fill: left_fill.map(|x| x as usize),
        right_fill: right_fill.map(|x| x as usize),
        line_style: line_style.map(|x| x as usize),
        fill_styles: Option::None,
        line_styles: Option::None,
    })
  )
}

pub fn parse_straight_edge_bits(input: (&[u8], usize)) -> IResult<(&[u8], usize), ast::shapes::StraightEdge> {
  do_parse!(
    input,
    apply!(skip_bits, 2) >> // Type flag and straight flag
    delta_bits: apply!(parse_u16_bits, 4) >>
    is_diagonal: call!(parse_bool_bits) >>
    is_vertical: map!(cond!(!is_diagonal, call!(parse_bool_bits)), |opt: Option<bool>| opt.unwrap_or_default()) >>
    delta_x: cond!(is_diagonal || !is_vertical, apply!(parse_i32_bits, (delta_bits + 2) as usize)) >>
    delta_y: cond!(is_diagonal || is_vertical, apply!(parse_i32_bits, (delta_bits + 2) as usize)) >>
    (ast::shapes::StraightEdge {
        delta_x: delta_x.unwrap_or_default(),
        delta_y: delta_y.unwrap_or_default(),
    })
  )
}

pub fn parse_curved_edge_bits(input: (&[u8], usize)) -> IResult<(&[u8], usize), ast::shapes::CurvedEdge> {
  do_parse!(
    input,
    apply!(skip_bits, 2) >> // Type flag and straight flag
    delta_bits: apply!(parse_u16_bits, 4) >>
    control_x: apply!(parse_i32_bits, (delta_bits + 2) as usize) >>
    control_y: apply!(parse_i32_bits, (delta_bits + 2) as usize) >>
    delta_x: apply!(parse_i32_bits, (delta_bits + 2) as usize) >>
    delta_y: apply!(parse_i32_bits, (delta_bits + 2) as usize) >>
    (ast::shapes::CurvedEdge {
      control_x: control_x,
      control_y: control_y,
      delta_x: delta_x,
      delta_y: delta_y,
    })
  )
}

pub fn parse_shape_record_list_bits(input: (&[u8], usize)) -> IResult<(&[u8], usize), Vec<ast::shapes::ShapeRecord>> {
  let mut block: Vec<ast::shapes::ShapeRecord> = Vec::new();
  let mut current_input = input;

  let mut fill_style_bits: usize;
  let mut line_style_bits: usize;

  match pair!(current_input, apply!(parse_u16_bits, 4), apply!(parse_u16_bits, 4)) {
    IResult::Done(remaining_input, parsed_style_bits) => {
      current_input = remaining_input;
      fill_style_bits = parsed_style_bits.0 as usize;
      line_style_bits = parsed_style_bits.1 as usize;
    }
    IResult::Error(e) => return IResult::Error(e),
    IResult::Incomplete(_) => return IResult::Incomplete(Needed::Unknown),
  };

  loop {
    match parse_u16_bits(current_input, 6) {
      IResult::Done(_, record_head) => if record_head == 0 { break },
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(_) => return IResult::Incomplete(Needed::Unknown),
    };

    let is_edge = match parse_bool_bits(current_input) {
      IResult::Done(_, is_edge) => is_edge,
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(_) => return IResult::Incomplete(Needed::Unknown),
    };

    if is_edge {
      let is_straight_edge = match parse_u16_bits(current_input, 2) {
        IResult::Done(_, is_straight_edge) => is_straight_edge & 1 > 0,
        IResult::Error(e) => return IResult::Error(e),
        IResult::Incomplete(_) => return IResult::Incomplete(Needed::Unknown),
      };
      if is_straight_edge {
        match parse_straight_edge_bits(current_input) {
          IResult::Done(next_input, straight_edge) => {
            let b = ast::shapes::ShapeRecord::StraightEdge(straight_edge);
            block.push(b);
            current_input = next_input;
          }
          IResult::Error(e) => return IResult::Error(e),
          IResult::Incomplete(n) => return IResult::Incomplete(n),
        };
      } else {
        match parse_curved_edge_bits(current_input) {
          IResult::Done(next_input, curved_edge) => {
            let b = ast::shapes::ShapeRecord::CurvedEdge(curved_edge);
            block.push(b);
            current_input = next_input;
          }
          IResult::Error(e) => return IResult::Error(e),
          IResult::Incomplete(n) => return IResult::Incomplete(n),
        };
      }
    } else {
      match parse_style_change_bits(current_input, fill_style_bits, line_style_bits) {
        IResult::Done(next_input, style_change) => {
          let b = ast::shapes::ShapeRecord::StyleChange(style_change);
          block.push(b);
          current_input = next_input;
        }
        IResult::Error(e) => return IResult::Error(e),
        IResult::Incomplete(n) => return IResult::Incomplete(n),
      };
    }
  }

  IResult::Done(current_input, block)
}

named!(
  pub parse_fill_style_list<Vec<ast::shapes::FillStyle>>,
    length_count!(parse_list_length, parse_fill_style)
);

named!(
  pub parse_shape<ast::shapes::Shape>,
  do_parse!(
    fill_styles: parse_fill_style_list >>
    line_styles: parse_line_style_list >>
    records: bits!(parse_shape_record_list_bits) >>
    (
      ast::shapes::Shape {
      fill_styles: fill_styles,
      line_styles: line_styles,
      records: records,
    })
  )
);

/// Parse a Metadata tag (code: 2)
named!(
  pub parse_define_shape<ast::tags::DefineShape>,
  do_parse!(
    id: parse_le_u16 >>
    bounds: parse_rect >>
    shape: parse_shape >>
    (
      ast::tags::DefineShape {
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
  pub parse_clip_event_flags<ast::shapes::ClipEventFlags>,
  bits!(parse_clip_event_flags_bits)
);

named!(
  pub parse_clip_event_flags_bits<(&[u8], usize), ast::shapes::ClipEventFlags>,
  do_parse!(
    key_up: call!(parse_bool_bits) >>
    key_down: call!(parse_bool_bits) >>
    mouse_up: call!(parse_bool_bits) >>
    mouse_down: call!(parse_bool_bits) >>
    unload: call!(parse_bool_bits) >>
    enter_frane: call!(parse_bool_bits) >>
    load: call!(parse_bool_bits) >>
    drag_over: call!(parse_bool_bits) >>
    roll_out: call!(parse_bool_bits) >>
    roll_over: call!(parse_bool_bits) >>
    release_outside: call!(parse_bool_bits) >>
    release: call!(parse_bool_bits) >>
    press: call!(parse_bool_bits) >>
    initialize: call!(parse_bool_bits) >>
    data: call!(parse_bool_bits) >>
    construct: call!(parse_bool_bits) >>
    key_press: call!(parse_bool_bits) >>
    drag_out: call!(parse_bool_bits) >>
    (ast::shapes::ClipEventFlags {
      key_up: key_up,
      key_down: key_down,
      mouse_up: mouse_up,
      mouse_down: mouse_down,
      unload: unload,
      enter_frane: enter_frane,
      load: load,
      drag_over: drag_over,
      roll_out: roll_out,
      roll_over: roll_over,
      release_outside: release_outside,
      release: release,
      press: press,
      initialize: initialize,
      data: data,
      construct: construct,
      key_press: key_press,
      drag_out: drag_out,
    })
  )
);

named!(
  pub parse_clip_action<ast::shapes::ClipAction>,
  do_parse!(
    event_flags: parse_clip_event_flags >>
    key_code: cond!(event_flags.key_press, parse_u8) >>
    (ast::shapes::ClipAction {
      event_flags: event_flags,
      key_code: key_code,
      actions: vec!(),
    })
  )
);

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
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
          // TODO: 59 => DoInitAction
          69 => map!(record_data, parse_file_attributes_tag, |t| ast::Tag::FileAttributes(t)),
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
