use swf_tree as ast;
use nom::{IResult, Needed};
use libflate;
use std::io;
use std::io::Read;
use tags::parse_swf_tag;
use parsers::swf_header::{parse_swf_header, parse_swf_header_signature};

pub fn parse_swf_tags_string(input: &[u8]) -> IResult<&[u8], Vec<ast::Tag>> {
  let mut result: Vec<ast::Tag> = Vec::new();
  let mut current_input: &[u8] = input;
  while current_input.len() > 0 {
    // A null byte indicates the end of the string of actions
    if current_input[0] == 0 {
      current_input = &current_input[1..];
      break;
    }
    match parse_swf_tag(current_input) {
      IResult::Done(next_input, swf_tag) => {
        current_input = next_input;
        result.push(swf_tag);
      }
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(_) => return IResult::Incomplete(Needed::Unknown),
    };
  }
  IResult::Done(current_input, result)
}

named!(
  pub parse_decompressed_movie<ast::Movie>,
  do_parse!(
    header: parse_swf_header >>
    tags: parse_swf_tags_string >>
    (ast::Movie {
      header: header,
      tags: tags,
    })
  )
);

pub fn parse_movie(input: &[u8]) -> IResult<&[u8], ast::Movie> {
  match parse_swf_header_signature(input) {
    IResult::Done(remaining_input, signature) => {
      match signature.compression_method {
        ast::CompressionMethod::None => parse_decompressed_movie(input),
        ast::CompressionMethod::Deflate => {
          let mut decoder = libflate::zlib::Decoder::new(io::Cursor::new(remaining_input)).unwrap();
          let mut decoded_data: Vec<u8> = vec![67, 87, 83, 8, 255, 184, 0, 0]; // Vec::new();
          decoder.read_to_end(&mut decoded_data).unwrap();
          match parse_decompressed_movie(&decoded_data[..]) {
            IResult::Done(_, parsed_swf_file) => IResult::Done(&input[input.len()..], parsed_swf_file),
            IResult::Error(e) => IResult::Error(e),
            IResult::Incomplete(n) => IResult::Incomplete(n),
          }
        }
        ast::CompressionMethod::Lzma => {
          unimplemented!()
        }
      }
    }
    IResult::Error(e) => IResult::Error(e),
    IResult::Incomplete(n) => IResult::Incomplete(n),
  }
}
