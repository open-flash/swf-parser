use fixed_point::fixed_point::{Ufixed8P8};
use std::vec::Vec;

// RGB color, 8-bit channels
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct Rgb {
  pub r: u8,
  pub g: u8,
  pub b: u8,
}

// RGBA color, 8-bit channels
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct Rgba {
  pub r: u8,
  pub g: u8,
  pub b: u8,
  pub a: u8,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct Rect {
  pub x_min: i16,
  pub x_max: i16,
  pub y_min: i16,
  pub y_max: i16,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CompressionMethod {
  None,
  Deflate,
  Lzma,
}

/// The prolog is the part of the header that is not compressed
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct SwfHeaderSignature {
  /// The compression method used for the body of this SWF file
  pub compression_method: CompressionMethod,
  /// SWF version
  pub swf_version: u8,
  // Uncompressed SWF File length (including the header)
  pub uncompressed_file_length: usize,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct SwfHeader {
  /// The compression method used for the body of this SWF file
  pub compression_method: CompressionMethod,
  /// SWF version
  pub swf_version: u8,
  // Uncompressed SWF File length (including the header)
  pub uncompressed_file_length: usize,
  // Frame size in twips
  pub frame_size: Rect,
  pub frame_rate: Ufixed8P8,
  pub frame_count: u16,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct ActionHeader {
  pub action_code: u8,
  pub length: usize,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct UnknownAction {
  pub action_code: u8,
  pub data: Vec<u8>,
}

pub mod action {
  use ordered_float::OrderedFloat;

  // Action code 0x81
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct GotoFrame {
    pub frame: usize,
  }

  // Action code 0x83
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct GetUrl {
    pub url: String,
    pub target: String,
  }

  // Action code 0x87
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct StoreRegister {
    pub register_number: u8,
  }

  // Action code 0x88
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct ConstantPool {
    pub constant_pool: Vec<String>,
  }

  // Action code 0x8a
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct WaitForFrame {
    pub frame: usize,
    pub skip_count: usize, // TODO: body: Vec<Action> ?
  }

  // Action code 0x8b
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct SetTarget {
    pub target_name: String,
  }

  // Action code 0x8c
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct GoToLabel {
    pub label: String,
  }

  // Action code 0x8d
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct WaitForFrame2 {
    pub skip_count: usize, // TODO: body: Vec<Action> ?
  }

  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct Parameter {
    pub register: u8,
    pub name: String,
  }

  // Action code 0x8e
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct DefineFunction2 {
    // Empty string if anonymous
    pub name: String,
    pub preload_parent: bool,
    pub preload_root: bool,
    pub suppress_super: bool,
    pub preload_super: bool,
    pub suppress_arguments: bool,
    pub preload_arguments: bool,
    pub suppress_this: bool,
    pub preload_this: bool,
    pub preload_global: bool,
    pub parameters: Vec<Parameter>,
    pub body: Vec<super::Action>,
  }

  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(tag = "type", content = "value", rename_all = "kebab-case")]
  pub enum CatchTarget {
    Register(u8),
    Variable(String),
  }

  // Action code 0x8f
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct Try {
    pub try_size: usize,
    pub catch_target: CatchTarget,
    pub catch_size: usize,
    pub finally_size: usize,
  }

  // Action code 0x94
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct With {
    pub code_size: usize, // TODO: body: Vec<Action>
  }

  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(tag = "type", content = "value", rename_all = "kebab-case")]
  pub enum Value {
    CString(String),
    F32(OrderedFloat<f32>),
    Null,
    Undefined,
    Register(u8),
    Boolean(bool),
    F64(OrderedFloat<f64>),
    I32(i32),
    Constant(u16),
  }

  // Action code 0x96
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct Push {
    pub values: Vec<Value>,
  }

  // Action code 0x99
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct Jump {
    pub branch_offset: i16,
  }

  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub enum SendVarsMethod {
    None,
    Get,
    Post,
  }

  // Action code 0x9a
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct GetUrl2 {
    pub send_vars_method: SendVarsMethod,
    pub load_target: bool,
    pub load_variables: bool,
  }

  // Action code 0x9b
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct DefineFunction {
    // Empty string if anonymous
    pub name: String,
    pub parameters: Vec<String>,
    pub body: Vec<super::Action>,
  }

  // Action code 0x9d
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct If {
    pub branch_offset: i16,
  }

  // Action code 0x9f
  #[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
  #[serde(rename_all = "kebab-case")]
  pub struct GotoFrame2 {
    pub play: bool,
    pub scene_bias: Option<usize>,
  }
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(tag = "action", rename_all = "kebab-case")]
pub enum Action {
  Unknown(UnknownAction),
  NextFrame, // 0x04
  PrevFrame, // 0x05
  Play, // 0x06
  Stop, // 0x07
  ToggleQuality, // 0x08
  StopSounds, // 0x09
  Add, // 0x0a
  Subtract, // 0x0b
  Multiply, // 0x0c
  Divide, // 0x0d
  Equals, // 0x0e
  Less, // 0x0f
  And, // 0x10
  Or, // 0x11
  Not, // 0x12
  StringEquals, // 0x13
  StringLength, // 0x14
  StringExtract, // 0x15
  Pop, // 0x17
  ToInteger, // 0x17
  GetVariable, // 0x1c
  SetVariable, // 0x1d
  SetTarget2, // 0x20
  StringAdd, // 0x21
  GetProperty, // 0x22
  SetProperty, // 0x23
  CloneSprite, // 0x24
  RemoveSprite, // 0x25
  Trace, // 0x26
  StartDrag, // 0x27
  EndDrag, // 0x28
  StringLess, // 0x29
  Throw, // 0x2a
  CastOp, // 0x2b
  ImplementsOp, // 0x2c
  RandomNumber, // 0x30
  MbStringLength, // 0x31
  CharToAscii, // 0x32
  AsciiToChar, // 0x33
  GetTime, // 0x34
  MbStringExtract, // 0x35
  MbCharToAscii, // 0x36
  MbAsciiToChar, // 0x37
  Delete, // 0x3a
  Delete2, // 0x3b
  DefineLocal, // 0x3c
  CallFunction, // 0x3d
  Return, // 0x3e
  Modulo, // 0x3f
  NewObject, // 0x40
  DefineLocal2, // 0x41
  InitArray, // 0x42
  InitObject, // 0x43
  TypeOf, // 0x44
  TargetPath, // 0x45
  Enumerate, // 0x46
  Add2, // 0x47
  Less2, // 0x48
  Equals2, // 0x49
  ToNumber, // 0x4a
  ToString, // 0x4b
  PushDuplicate, // 0x4c
  StackSwap, // 0x4d
  GetMember, // 0x4e
  SetMember, // 0x4f
  Increment, // 0x50
  Decrement, // 0x51
  CallMethod, // 0x52
  NewMethod, // 0x53
  InstanceOf, // 0x54
  Enumerate2, // 0x55
  BitAnd, // 0x60
  BitOr, // 0x61
  BitXor, // 0x62
  BitLShift, // 0x63
  BitRShift, // 0x64
  BitURShift, // 0x65
  StrictEquals, // 0x66
  Greater, // 0x67
  StringGreater, // 0x68
  Extends, // 0x69
  GotoFrame(action::GotoFrame), // 0x81
  GetUrl(action::GetUrl), // 0x83
  StoreRegister(action::StoreRegister), // 0x87
  ConstantPool(action::ConstantPool), // 0x88
  WaitForFrame(action::WaitForFrame), // 0x8a
  SetTarget(action::SetTarget), // 0x8b
  GotoLabel(action::GoToLabel), // 0x8c
  WaitForFrame2(action::WaitForFrame2), // 0x8d
  DefineFunction2(action::DefineFunction2), // 0x8e
  Try(action::Try), // 0x8f
  With(action::With), // 0x94
  Push(action::Push), // 0x96
  Jump(action::Jump), // 0x99
  GetUrl2(action::GetUrl2), // 0x9a
  DefineFunction(action::DefineFunction), // 0x9b
  If(action::If), // 0x9d
  Call, // 0x9e
  GotoFrame2(action::GotoFrame2), // 0x9f
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct SwfTagHeader {
  pub tag_code: u16,
  pub length: usize,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct UnknownTag {
  pub tag_code: u16,
  pub data: Vec<u8>,
}

// Tag code: 4
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct PlaceObjectTag {
  id: u16,
  depth: u16,
  //  matrix: Matrix,
  //  color_transform: Some(ColoTransform),
}

// Tag code: 9
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct SetBackgroundColorTag {
  /// Color of the display background
  pub color: Rgb,
}

// Tag code: 12
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct DoActionTag {
  pub actions: Vec<Action>,
}

// Tag code: 69
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct FileAttributesTag {
  pub use_direct_blit: bool,
  pub use_gpu: bool,
  pub has_metadata: bool,
  pub use_as3: bool,
  // Not in the spec, found in Shumway
  pub no_cross_domain_caching: bool,
  // Not in the spec, found in Shumway
  pub use_relative_urls: bool,
  pub use_network: bool,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct Scene {
  pub offset: u32,
  pub name: String,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct Label {
  pub frame: u32,
  pub name: String,
}

// Tag code: 86
#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct DefineSceneAndFrameLabelDataTag {
  pub scenes: Vec<Scene>,
  pub labels: Vec<Label>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum SwfTag {
  Unknown(UnknownTag),
  End,
  ShowFrame,
  PlaceObject(PlaceObjectTag),
  SetBackgroundColor(SetBackgroundColorTag),
  DoAction(DoActionTag),
  FileAttributes(FileAttributesTag),
  DefineSceneAndFrameLabelData(DefineSceneAndFrameLabelDataTag),
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub struct SwfFile {
  pub header: SwfHeader,
  pub tags: Vec<SwfTag>,
}

#[cfg(test)]
mod tests {
  use ordered_float::OrderedFloat;
  use ast;
  use std;

  #[test]
  fn action_value_eq() {
    assert_eq!(ast::action::Value::Null, ast::action::Value::Null);
    assert_ne!(ast::action::Value::Null, ast::action::Value::Undefined);
    assert_eq!(ast::action::Value::I32(2), ast::action::Value::I32(2));
    assert_eq!(ast::action::Value::F32(OrderedFloat(2.0)), ast::action::Value::F32(OrderedFloat(2.0)));
    assert_eq!(ast::action::Value::F32(OrderedFloat(std::f32::NAN)), ast::action::Value::F32(OrderedFloat(std::f32::NAN)));
  }
}
