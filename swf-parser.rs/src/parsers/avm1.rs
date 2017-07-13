use swf_tree as ast;
use nom::{IResult, Needed};
use nom::{le_f32 as parse_le_f32, le_f64 as parse_le_f64, le_u8 as parse_u8, le_u16 as parse_le_u16, le_i16 as parse_le_i16, le_i32 as parse_le_i32};
use parsers::basic_data_types::{parse_bool_bits, parse_c_string, skip_bits};


#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct ActionHeader {
  pub action_code: u8,
  pub length: usize,
}

// TODO: Use nom::cond
pub fn parse_action_header(input: &[u8]) -> IResult<&[u8], ActionHeader> {
  match parse_u8(input) {
    IResult::Done(remaining_input, action_code) => {
      if action_code < 0x80 {
        IResult::Done(remaining_input, ActionHeader { action_code: action_code, length: 0 })
      } else {
        parse_le_u16(remaining_input)
          .map(|length| ActionHeader { action_code: action_code, length: length as usize })
      }
    }
    IResult::Error(e) => IResult::Error(e),
    IResult::Incomplete(n) => IResult::Incomplete(n),
  }
}

// Action 0x81
named!(parse_goto_frame_action<&[u8], ast::avm1::actions::GotoFrame>,
  do_parse!(
    frame: parse_le_u16 >>
    (ast::avm1::actions::GotoFrame {
      frame: frame as usize,
    })
  )
);

// Action 0x83
named!(parse_get_url_action<&[u8], ast::avm1::actions::GetUrl>,
  do_parse!(
    url: parse_c_string >>
    target: parse_c_string >>
    (ast::avm1::actions::GetUrl {
      url: url,
      target: target,
    })
  )
);

// Action 0x87
named!(parse_store_register_action<&[u8], ast::avm1::actions::StoreRegister>,
  do_parse!(
    register_number: parse_u8 >>
    (ast::avm1::actions::StoreRegister {
      register_number: register_number,
    })
  )
);

// Action 0x88
named!(parse_constant_pool_action<&[u8], ast::avm1::actions::ConstantPool>,
  dbg_dmp!(do_parse!(
    constant_pool: length_count!(parse_le_u16, parse_c_string) >>
    (ast::avm1::actions::ConstantPool {
      constant_pool: constant_pool,
    })
  ))
);

// Action 0x8a
named!(parse_wait_for_frame_action<&[u8], ast::avm1::actions::WaitForFrame>,
  do_parse!(
    frame: parse_le_u16 >>
    skip_count: parse_u8 >>
    (ast::avm1::actions::WaitForFrame {
      frame: frame as usize,
      skip_count: skip_count as usize,
    })
  )
);

// Action 0x8b
named!(parse_set_target_action<&[u8], ast::avm1::actions::SetTarget>,
  do_parse!(
    target_name: parse_c_string >>
    (ast::avm1::actions::SetTarget {
      target_name: target_name,
    })
  )
);

// Action 0x8c
named!(parse_goto_label_action<&[u8], ast::avm1::actions::GoToLabel>,
  do_parse!(
    label: parse_c_string >>
    (ast::avm1::actions::GoToLabel {
      label: label,
    })
  )
);

// Action 0x8d
named!(parse_wait_for_frame2_action<&[u8], ast::avm1::actions::WaitForFrame2>,
  do_parse!(
    skip_count: parse_u8 >>
    (ast::avm1::actions::WaitForFrame2 {
      skip_count: skip_count as usize,
    })
  )
);

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
struct DefineFunction2Flags {
  pub preload_parent: bool,
  pub preload_root: bool,
  pub suppress_super: bool,
  pub preload_super: bool,
  pub suppress_arguments: bool,
  pub preload_arguments: bool,
  pub suppress_this: bool,
  pub preload_this: bool,
  pub preload_global: bool,
}

// TODO(demurgos): registerCount

// Action 0x8e
named!(parse_define_function2_action<&[u8], ast::avm1::actions::DefineFunction2>,
  dbg_dmp!(do_parse!(
    name: parse_c_string >>
    parameter_count: parse_le_u16 >>
    register_count: parse_u8 >>
    flags: bits!(do_parse!(
      preload_parent: call!(parse_bool_bits) >>
      preload_root: call!(parse_bool_bits) >>
      suppress_super: call!(parse_bool_bits) >>
      preload_super: call!(parse_bool_bits) >>
      suppress_arguments: call!(parse_bool_bits) >>
      preload_arguments: call!(parse_bool_bits) >>
      suppress_this: call!(parse_bool_bits) >>
      preload_this: call!(parse_bool_bits) >>
      apply!(skip_bits, 7) >>
      preload_global: call!(parse_bool_bits) >>
      (DefineFunction2Flags {
        preload_parent: preload_parent,
        preload_root: preload_root,
        suppress_super: suppress_super,
        preload_super: preload_super,
        suppress_arguments: suppress_arguments,
        preload_arguments: preload_arguments,
        suppress_this: suppress_this,
        preload_this: preload_this,
        preload_global: preload_global,
      })
    )) >>
    parameters: count!(map!(pair!(parse_u8, parse_c_string), |p: (u8, String)| ast::avm1::actions::Parameter {register: p.0, name: p.1}), parameter_count as usize) >>
    code_size: parse_le_u16 >>
    body: call!(parse_actions_block, code_size as usize) >>
    (ast::avm1::actions::DefineFunction2 {
      name: name,
      preload_parent: flags.preload_parent,
      preload_root: flags.preload_root,
      suppress_super: flags.suppress_super,
      preload_super: flags.preload_super,
      suppress_arguments: flags.suppress_arguments,
      preload_arguments: flags.preload_arguments,
      suppress_this: flags.suppress_this,
      preload_this: flags.preload_this,
      preload_global: flags.preload_global,
      register_count: register_count as usize,
      parameters: parameters,
      body: body,
    })
  ))
);

fn parse_catch_target(input: &[u8], catch_in_register: bool) -> IResult<&[u8], ast::avm1::actions::CatchTarget> {
  if catch_in_register {
    parse_u8(input).map(|v| ast::avm1::actions::CatchTarget::Register(v))
  } else {
    parse_c_string(input).map(|v: String| ast::avm1::actions::CatchTarget::Variable(v))
  }
}

// Action 0x8f
named!(parse_try_action<&[u8], ast::avm1::actions::Try>,
  do_parse!(
    flags: bits!(do_parse!(
      apply!(skip_bits, 5) >>
      catch_in_register: parse_bool_bits >>
      finally_block: parse_bool_bits >>
      catch_block: parse_bool_bits >>
      ((catch_in_register, catch_block, finally_block))
    )) >>
    try_size: parse_le_u16 >>
    finally_size: parse_le_u16 >>
    catch_size: parse_le_u16 >>
    catch_target: call!(parse_catch_target, flags.0) >>
//    try_body: call!(parse_actions_block, try_size as usize) >>
//    catch_body: cond!(flags.1, call!(parse_actions_block, catch_size as usize)) >>
//    finally_body: cond!(flags.2, call!(parse_actions_block, finally_size as usize)) >>
    (ast::avm1::actions::Try {
      try_size: try_size as usize,
      catch_target: catch_target,
      catch_size: catch_size as usize,
      finally_size: finally_size as usize,
    })
  )
);

// Action 0x94
named!(parse_with_action<&[u8], ast::avm1::actions::With>,
  do_parse!(
    code_size: parse_le_i16 >>
    (ast::avm1::actions::With {
      code_size: code_size as usize,
    })
  )
);

named!(parse_action_value<&[u8], ast::avm1::actions::Value>,
  switch!(parse_u8,
   0 => map!(parse_c_string, |v: String| ast::avm1::actions::Value::CString(v)) |
   1 => map!(parse_le_f32, |v| ast::avm1::actions::Value::F32(::ordered_float::OrderedFloat::<f32>(v))) |
   2 => value!(ast::avm1::actions::Value::Null) |
   3 => value!(ast::avm1::actions::Value::Undefined) |
   4 => map!(parse_u8, |v| ast::avm1::actions::Value::Register(v)) |
   5 => map!(parse_u8, |v| ast::avm1::actions::Value::Boolean(v != 0)) |
   6 => map!(parse_le_f64, |v| ast::avm1::actions::Value::F64(::ordered_float::OrderedFloat::<f64>(v))) |
   7 => map!(parse_le_i32, |v| ast::avm1::actions::Value::I32(v)) |
   8 => map!(parse_u8, |v| ast::avm1::actions::Value::Constant(v as u16)) |
   9 => map!(parse_le_u16, |v| ast::avm1::actions::Value::Constant(v))
  )
);

// Action 0x96
named!(parse_push_action<&[u8], ast::avm1::actions::Push>,
  do_parse!(
    values: many1!(parse_action_value) >>
    (ast::avm1::actions::Push {
      values: values,
    })
  )
);

// Action 0x99
named!(parse_jump_action<&[u8], ast::avm1::actions::Jump>,
  do_parse!(
    branch_offset: parse_le_i16 >>
    (ast::avm1::actions::Jump {
      branch_offset: branch_offset,
    })
  )
);

// Action 0x9a
named!(parse_get_url2_action<&[u8], ast::avm1::actions::GetUrl2>,
  bits!(do_parse!(
    // TODO: Use switch! and value!
    send_vars_method: map!(
      take_bits!(u8, 2),
      |v| match v {
        0 => ast::avm1::actions::SendVarsMethod::None,
        1 => ast::avm1::actions::SendVarsMethod::Get,
        2 => ast::avm1::actions::SendVarsMethod::Post,
        _ => panic!("Unexpected value for `send_vars_method`."),
      }
    ) >>
    load_target: parse_bool_bits >>
    load_variables: parse_bool_bits >>
    (ast::avm1::actions::GetUrl2 {
      send_vars_method: send_vars_method,
      load_target: load_target,
      load_variables: load_variables,
    })
  ))
);

named!(parse_define_function_action<&[u8], ast::avm1::actions::DefineFunction>,
  dbg_dmp!(do_parse!(
    name: parse_c_string >>
    parameter_count: parse_le_u16 >>
    parameters: count!(parse_c_string, parameter_count as usize) >>
    code_size: parse_le_u16 >>
    body: call!(parse_actions_block, code_size as usize) >>
    (ast::avm1::actions::DefineFunction {
      name: name,
      parameters: parameters,
      body: body,
    })
  ))
);

// Action 0x9d
named!(parse_if_action<&[u8], ast::avm1::actions::If>,
  do_parse!(
    branch_offset: parse_le_i16 >>
    (ast::avm1::actions::If {
      branch_offset: branch_offset,
    })
  )
);

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
struct GotoFrame2Flags {
  pub scene_bias: bool,
  pub play: bool,
}

// Action 0x9f
named!(parse_goto_frame2_action<&[u8], ast::avm1::actions::GotoFrame2>,
  do_parse!(
    flags: bits!(do_parse!(
      apply!(skip_bits, 6) >>
      scene_bias: parse_bool_bits >>
      play: parse_bool_bits >>
      ((scene_bias, play))
    )) >>
    scene_bias: cond!(flags.0, parse_le_u16) >>
    (ast::avm1::actions::GotoFrame2 {
      play: flags.1,
      scene_bias: scene_bias.map(|v| v as usize),
    })
  )
);

fn parse_action(input: &[u8]) -> IResult<&[u8], ast::avm1::Action> {
  match parse_action_header(input) {
    IResult::Done(remaining_input, ah) => {
      if remaining_input.len() < ah.length {
        let action_header_length = input.len() - remaining_input.len();
        IResult::Incomplete(Needed::Size(action_header_length + ah.length))
      } else {
        let result = match ah.action_code {
          0x04 => IResult::Done(remaining_input, ast::avm1::Action::NextFrame),
          0x05 => IResult::Done(remaining_input, ast::avm1::Action::PrevFrame),
          0x06 => IResult::Done(remaining_input, ast::avm1::Action::Play),
          0x07 => IResult::Done(remaining_input, ast::avm1::Action::Stop),
          0x08 => IResult::Done(remaining_input, ast::avm1::Action::ToggleQuality),
          0x09 => IResult::Done(remaining_input, ast::avm1::Action::StopSounds),
          0x0a => IResult::Done(remaining_input, ast::avm1::Action::Add),
          0x0b => IResult::Done(remaining_input, ast::avm1::Action::Subtract),
          0x0c => IResult::Done(remaining_input, ast::avm1::Action::Multiply),
          0x0d => IResult::Done(remaining_input, ast::avm1::Action::Divide),
          0x0e => IResult::Done(remaining_input, ast::avm1::Action::Equals),
          0x0f => IResult::Done(remaining_input, ast::avm1::Action::Less),
          0x10 => IResult::Done(remaining_input, ast::avm1::Action::And),
          0x11 => IResult::Done(remaining_input, ast::avm1::Action::Or),
          0x12 => IResult::Done(remaining_input, ast::avm1::Action::Not),
          0x13 => IResult::Done(remaining_input, ast::avm1::Action::StringEquals),
          0x14 => IResult::Done(remaining_input, ast::avm1::Action::StringLength),
          0x15 => IResult::Done(remaining_input, ast::avm1::Action::StringExtract),
          0x17 => IResult::Done(remaining_input, ast::avm1::Action::Pop),
          0x18 => IResult::Done(remaining_input, ast::avm1::Action::ToInteger),
          0x1c => IResult::Done(remaining_input, ast::avm1::Action::GetVariable),
          0x1d => IResult::Done(remaining_input, ast::avm1::Action::SetVariable),
          0x20 => IResult::Done(remaining_input, ast::avm1::Action::SetTarget2),
          0x21 => IResult::Done(remaining_input, ast::avm1::Action::StringAdd),
          0x22 => IResult::Done(remaining_input, ast::avm1::Action::GetProperty),
          0x23 => IResult::Done(remaining_input, ast::avm1::Action::SetProperty),
          0x24 => IResult::Done(remaining_input, ast::avm1::Action::CloneSprite),
          0x25 => IResult::Done(remaining_input, ast::avm1::Action::RemoveSprite),
          0x26 => IResult::Done(remaining_input, ast::avm1::Action::Trace),
          0x27 => IResult::Done(remaining_input, ast::avm1::Action::StartDrag),
          0x28 => IResult::Done(remaining_input, ast::avm1::Action::EndDrag),
          0x29 => IResult::Done(remaining_input, ast::avm1::Action::StringLess),
          0x2a => IResult::Done(remaining_input, ast::avm1::Action::Throw),
          0x2b => IResult::Done(remaining_input, ast::avm1::Action::CastOp),
          0x2c => IResult::Done(remaining_input, ast::avm1::Action::ImplementsOp),
          0x30 => IResult::Done(remaining_input, ast::avm1::Action::RandomNumber),
          0x31 => IResult::Done(remaining_input, ast::avm1::Action::MbStringLength),
          0x32 => IResult::Done(remaining_input, ast::avm1::Action::CharToAscii),
          0x33 => IResult::Done(remaining_input, ast::avm1::Action::AsciiToChar),
          0x34 => IResult::Done(remaining_input, ast::avm1::Action::GetTime),
          0x35 => IResult::Done(remaining_input, ast::avm1::Action::MbStringExtract),
          0x36 => IResult::Done(remaining_input, ast::avm1::Action::MbCharToAscii),
          0x37 => IResult::Done(remaining_input, ast::avm1::Action::MbAsciiToChar),
          0x3a => IResult::Done(remaining_input, ast::avm1::Action::Delete),
          0x3b => IResult::Done(remaining_input, ast::avm1::Action::Delete2),
          0x3c => IResult::Done(remaining_input, ast::avm1::Action::DefineLocal),
          0x3d => IResult::Done(remaining_input, ast::avm1::Action::CallFunction),
          0x3e => IResult::Done(remaining_input, ast::avm1::Action::Return),
          0x3f => IResult::Done(remaining_input, ast::avm1::Action::Modulo),
          0x40 => IResult::Done(remaining_input, ast::avm1::Action::NewObject),
          0x41 => IResult::Done(remaining_input, ast::avm1::Action::DefineLocal2),
          0x42 => IResult::Done(remaining_input, ast::avm1::Action::InitArray),
          0x43 => IResult::Done(remaining_input, ast::avm1::Action::InitObject),
          0x44 => IResult::Done(remaining_input, ast::avm1::Action::TypeOf),
          0x45 => IResult::Done(remaining_input, ast::avm1::Action::TargetPath),
          0x46 => IResult::Done(remaining_input, ast::avm1::Action::Enumerate),
          0x47 => IResult::Done(remaining_input, ast::avm1::Action::Add2),
          0x48 => IResult::Done(remaining_input, ast::avm1::Action::Less2),
          0x49 => IResult::Done(remaining_input, ast::avm1::Action::Equals2),
          0x4a => IResult::Done(remaining_input, ast::avm1::Action::ToNumber),
          0x4b => IResult::Done(remaining_input, ast::avm1::Action::ToString),
          0x4c => IResult::Done(remaining_input, ast::avm1::Action::PushDuplicate),
          0x4d => IResult::Done(remaining_input, ast::avm1::Action::StackSwap),
          0x4e => IResult::Done(remaining_input, ast::avm1::Action::GetMember),
          0x4f => IResult::Done(remaining_input, ast::avm1::Action::SetMember),
          0x50 => IResult::Done(remaining_input, ast::avm1::Action::Increment),
          0x51 => IResult::Done(remaining_input, ast::avm1::Action::Decrement),
          0x52 => IResult::Done(remaining_input, ast::avm1::Action::CallMethod),
          0x53 => IResult::Done(remaining_input, ast::avm1::Action::NewMethod),
          0x54 => IResult::Done(remaining_input, ast::avm1::Action::InstanceOf),
          0x55 => IResult::Done(remaining_input, ast::avm1::Action::Enumerate2),
          0x60 => IResult::Done(remaining_input, ast::avm1::Action::BitAnd),
          0x61 => IResult::Done(remaining_input, ast::avm1::Action::BitOr),
          0x62 => IResult::Done(remaining_input, ast::avm1::Action::BitXor),
          0x63 => IResult::Done(remaining_input, ast::avm1::Action::BitLShift),
          0x64 => IResult::Done(remaining_input, ast::avm1::Action::BitRShift),
          0x65 => IResult::Done(remaining_input, ast::avm1::Action::BitURShift),
          0x66 => IResult::Done(remaining_input, ast::avm1::Action::StrictEquals),
          0x67 => IResult::Done(remaining_input, ast::avm1::Action::Greater),
          0x68 => IResult::Done(remaining_input, ast::avm1::Action::StringGreater),
          0x69 => IResult::Done(remaining_input, ast::avm1::Action::Extends),
          0x81 => map!(remaining_input, parse_goto_frame_action, |a| ast::avm1::Action::GotoFrame(a)),
          0x83 => map!(remaining_input, parse_get_url_action, |a| ast::avm1::Action::GetUrl(a)),
          0x87 => map!(remaining_input, parse_store_register_action, |a| ast::avm1::Action::StoreRegister(a)),
          0x88 => map!(remaining_input, parse_constant_pool_action, |a| ast::avm1::Action::ConstantPool(a)),
          0x8a => map!(remaining_input, parse_wait_for_frame_action, |a| ast::avm1::Action::WaitForFrame(a)),
          0x8b => map!(remaining_input, parse_set_target_action, |a| ast::avm1::Action::SetTarget(a)),
          0x8c => map!(remaining_input, parse_goto_label_action, |a| ast::avm1::Action::GotoLabel(a)),
          0x8d => map!(remaining_input, parse_wait_for_frame2_action, |a| ast::avm1::Action::WaitForFrame2(a)),
          0x8e => map!(remaining_input, parse_define_function2_action, |a| ast::avm1::Action::DefineFunction2(a)),
          0x8f => map!(remaining_input, parse_try_action, |a| ast::avm1::Action::Try(a)),
          0x94 => map!(remaining_input, parse_with_action, |a| ast::avm1::Action::With(a)),
          0x96 => map!(remaining_input, parse_push_action, |a| ast::avm1::Action::Push(a)),
          0x99 => map!(remaining_input, parse_jump_action, |a| ast::avm1::Action::Jump(a)),
          0x9a => map!(remaining_input, parse_get_url2_action, |a| ast::avm1::Action::GetUrl2(a)),
          0x9b => map!(remaining_input, parse_define_function_action, |a| ast::avm1::Action::DefineFunction(a)),
          0x9d => map!(remaining_input, parse_if_action, |a| ast::avm1::Action::If(a)),
          0x9e => IResult::Done(remaining_input, ast::avm1::Action::Call),
          0x9f => map!(remaining_input, parse_goto_frame2_action, |a| ast::avm1::Action::GotoFrame2(a)),
          _ => {
            IResult::Done(
              &remaining_input[ah.length..],
              ast::avm1::Action::Unknown(ast::avm1::actions::UnknownAction { code: ah.action_code, data: (&remaining_input[..ah.length]).to_vec() }))
          }
        };
        match result {
          IResult::Done(remaining_input2, action) => {
            // TODO: Check that we consumed at least ah.length
            IResult::Done(remaining_input2, action)
          },
          a => a
        }
      }
    }
    IResult::Error(e) => IResult::Error(e),
    IResult::Incomplete(n) => IResult::Incomplete(n),
  }
}

pub fn parse_actions_block(input: &[u8], code_size: usize) -> IResult<&[u8], Vec<ast::avm1::Action>> {
  let mut block: Vec<ast::avm1::Action> = Vec::new();
  let mut current_input = &input[..code_size];

  while current_input.len() > 0 {
    match parse_action(current_input) {
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(Needed::Unknown) => return IResult::Incomplete(Needed::Unknown),
      IResult::Incomplete(Needed::Size(i)) => return IResult::Incomplete(Needed::Size(i)),
      IResult::Done(remaining_input, action) => {
        block.push(action);
        current_input = remaining_input;
      },
    }
  }

  IResult::Done(&input[code_size..], block)
}

pub fn parse_actions_string(input: &[u8]) -> IResult<&[u8], Vec<ast::avm1::Action>> {
  let mut block: Vec<ast::avm1::Action> = Vec::new();
  let mut current_input = input;

  if current_input.len() == 0 {
    return IResult::Incomplete(Needed::Size(1));
  }

  while current_input[0] != 0 {
    match parse_action(current_input) {
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(Needed::Unknown) => return IResult::Incomplete(Needed::Unknown),
      IResult::Incomplete(Needed::Size(i)) => return IResult::Incomplete(Needed::Size(i)),
      IResult::Done(remaining_input, action) => {
        block.push(action);
        current_input = remaining_input;
      },
    }
    if current_input.len() == 0 {
      return IResult::Incomplete(Needed::Unknown);
    }
  }

  IResult::Done(current_input, block)
}

#[cfg(test)]
mod tests {
  use nom;
  use super::*;

  #[test]
  fn test_parse_push_action() {
    {
      let input = vec![0x04, 0x00, 0x07, 0x01, 0x00, 0x00, 0x00, 0x08, 0x02];
      let actual = parse_push_action(&input[..]);
      let expected = nom::IResult::Done(
        &[][..],
        ast::avm1::actions::Push {
          values: vec![
            ast::avm1::actions::Value::Register(0),
            ast::avm1::actions::Value::I32(1),
            ast::avm1::actions::Value::Constant(2),
          ]
        }
      );
      assert_eq!(actual, expected);
    }
    {
      let input = vec![0x00, 0x00];
      let actual = parse_push_action(&input[..]);
      let expected = nom::IResult::Done(
        &[][..],
        ast::avm1::actions::Push {
          values: vec![
            ast::avm1::actions::Value::CString(String::from("")),
          ]
        }
      );
      assert_eq!(actual, expected);
    }
    {
      let input = vec![0x00, 0x01, 0x00];
      let actual = parse_push_action(&input[..]);
      let expected = nom::IResult::Done(
        &[][..],
        ast::avm1::actions::Push {
          values: vec![
            ast::avm1::actions::Value::CString(String::from("\x01")),
          ]
        }
      );
      assert_eq!(actual, expected);
    }
  }

  #[test]
  fn test_parse_action_header() {
    {
      let input = vec![0b00000000, 0b00000000, 0b00000000, 0b00000000];
      assert_eq!(parse_action_header(&input[..]), nom::IResult::Done(&input[1..], ActionHeader { action_code: 0x00, length: 0 }));
    }
    {
      let input = vec![0b00000001, 0b00000000, 0b00000000, 0b00000000];
      assert_eq!(parse_action_header(&input[..]), nom::IResult::Done(&input[1..], ActionHeader { action_code: 0x01, length: 0 }));
    }
    {
      let input = vec![0b00010000, 0b00000000, 0b00000000, 0b00000000];
      assert_eq!(parse_action_header(&input[..]), nom::IResult::Done(&input[1..], ActionHeader { action_code: 0x10, length: 0 }));
    }
    {
      let input = vec![0b10000000, 0b00000000, 0b00000000, 0b00000000];
      assert_eq!(parse_action_header(&input[..]), nom::IResult::Done(&input[3..], ActionHeader { action_code: 0x80, length: 0 }));
    }
    {
      let input = vec![0b10000000, 0b00000001, 0b00000000, 0b00000000];
      assert_eq!(parse_action_header(&input[..]), nom::IResult::Done(&input[3..], ActionHeader { action_code: 0x80, length: 1 }));
    }
    {
      let input = vec![0b10000000, 0b00000000, 0b00000001, 0b00000000];
      assert_eq!(parse_action_header(&input[..]), nom::IResult::Done(&input[3..], ActionHeader { action_code: 0x80, length: 256 }));
    }
  }

  #[test]
  fn test_parse_action() {
    {
      let input = vec![0b00000001, 0b00000000, 0b00000000, 0b00000000];
      assert_eq!(
      parse_action(&input[..]),
      nom::IResult::Done(&input[1..], ast::avm1::Action::Unknown(ast::avm1::actions::UnknownAction { code: 0x01, data: Vec::new() }))
      );
    }
    {
      let input = vec![0b10000000, 0b00000001, 0b00000000, 0b00000011];
      assert_eq!(
      parse_action(&input[..]),
      nom::IResult::Done(&input[4..], ast::avm1::Action::Unknown(ast::avm1::actions::UnknownAction { code: 0x80, data: vec![0x03] }))
      );
    }
    {
      let input = vec![0b10000000, 0b00000010, 0b00000000, 0b00000011];
      assert_eq!(
      parse_action(&input[..]),
      nom::IResult::Incomplete(nom::Needed::Size(5))
      );
    }
  }
}
