use ast;
use nom::{IResult, Needed};
use nom::{le_u16 as parse_le_u16, le_u32 as parse_le_u32};
use parsers::avm1::{parse_actions_string};
use parsers::basic_data_types::{parse_bool_bits, parse_c_string, parse_encoded_le_u32, parse_rgb, skip_bits};

fn parse_swf_tag_header(input: &[u8]) -> IResult<&[u8], ast::SwfTagHeader> {
  match parse_le_u16(input) {
    IResult::Done(remaining_input, code_and_length) => {
      let code = code_and_length >> 6;
      let max_length = (1 << 6) - 1;
      let length = code_and_length & max_length;
      if length < max_length {
        IResult::Done(remaining_input, ast::SwfTagHeader { tag_code: code, length: length as usize })
      } else {
        map!(remaining_input, parse_le_u32, |long_length| ast::SwfTagHeader { tag_code: code, length: long_length as usize })
      }
    }
    IResult::Error(e) => IResult::Error(e),
    IResult::Incomplete(n) => IResult::Incomplete(n),
  }
}

/// Parse a SetBackgroundColor tag (code: 9)
named!(
  pub parse_set_background_color_tag<ast::SetBackgroundColorTag>,
  do_parse!(
    color: parse_rgb >>
    (ast::SetBackgroundColorTag {
      color: color,
    })
  )
);

/// Parse a DoAction tag (code: 12)
named!(
  pub parse_do_action_tag<ast::DoActionTag>,
  map!(
    parse_actions_string,
    |actions| ast::DoActionTag {actions: actions}
  )
);

/// Parse a FileAttributes tag (code: 69)
named!(
  pub parse_file_attributes_tag<ast::FileAttributesTag>,
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
      (ast::FileAttributesTag {
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
  pub parse_define_scene_and_frame_label_data_tag<ast::DefineSceneAndFrameLabelDataTag>,
  do_parse!(
    scene_count: parse_encoded_le_u32 >>
    scenes: fold_many_m_n!(
      scene_count as usize,
      scene_count as usize,
      pair!(parse_encoded_le_u32, parse_c_string),
      Vec::new(),
      |mut acc: Vec<_>, (offset, name)| {
        acc.push(ast::Scene {offset: offset, name: name});
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
        acc.push(ast::Label {frame: frame, name: name});
        acc
      }
    ) >>
    (
      ast::DefineSceneAndFrameLabelDataTag {
      scenes: scenes,
      labels: labels,
    })
  )
);

pub fn parse_swf_tag(input: &[u8]) -> IResult<&[u8], ast::SwfTag> {
  match parse_swf_tag_header(input) {
    IResult::Done(remaining_input, rh) => {
      if remaining_input.len() < rh.length {
        let record_header_length = input.len() - remaining_input.len();
        IResult::Incomplete(Needed::Size(record_header_length + rh.length))
      } else {
        let record_data: &[u8] = &remaining_input[..rh.length];
        let remaining_input: &[u8] = &remaining_input[rh.length..];
        let record_result = match rh.tag_code {
          0 => IResult::Done(&record_data[rh.length..], ast::SwfTag::End),
          1 => IResult::Done(&record_data[rh.length..], ast::SwfTag::ShowFrame),
          9 => map!(record_data, parse_set_background_color_tag, |t| ast::SwfTag::SetBackgroundColor(t)),
          // TODO: Ignore DoAction if version >= 9 && use_as3
          12 => map!(record_data, parse_do_action_tag, |t| ast::SwfTag::DoAction(t)),
          // TODO: 59 => DoInitAction
          69 => map!(record_data, parse_file_attributes_tag, |t| ast::SwfTag::FileAttributes(t)),
          86 => map!(record_data, parse_define_scene_and_frame_label_data_tag, |t| ast::SwfTag::DefineSceneAndFrameLabelData(t)),
          _ => {
            IResult::Done(&[][..], ast::SwfTag::Unknown(ast::UnknownTag { tag_code: rh.tag_code, data: record_data.to_vec() }))
          }
        };
        match record_result {
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
