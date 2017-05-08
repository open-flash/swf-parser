use ast;
use nom::{IResult, Needed};
use libflate;
use std::io;
use std::io::Read;
use parsers::swf_tags::{parse_swf_tag};
use parsers::swf_header::{parse_swf_header, parse_swf_header_signature};

pub fn parse_swf_tags_string(input: &[u8]) -> IResult<&[u8], Vec<ast::SwfTag>> {
  let mut result: Vec<ast::SwfTag> = Vec::new();
  let mut current_input: &[u8] = input;
  loop {
    match parse_swf_tag(current_input) {
      IResult::Done(next_input, swf_tag) => {
        current_input = next_input;
        match swf_tag {
          ast::SwfTag::End => {result.push(swf_tag); break},
          _ => result.push(swf_tag)
        }
      },
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(_) => return IResult::Incomplete(Needed::Unknown),
    }
  }
  IResult::Done(current_input, result)
}

named!(
  pub parse_decompressed_swf_file<ast::SwfFile>,
  do_parse!(
    header: parse_swf_header >>
    tag0: parse_swf_tag >>
    tag1: parse_swf_tag >>
    tag2: parse_swf_tag >>
    tag3: parse_swf_tag >>
    tag4: parse_swf_tag >>
    (ast::SwfFile {
      header: header,
      tags: vec![tag0, tag1, tag2, tag3, tag4],
    })
  )
);

pub fn parse_swf_file(input: &[u8]) -> IResult<&[u8], ast::SwfFile> {
  match parse_swf_header_signature(input) {
    IResult::Done(remaining_input, signature) => {
      match signature.compression_method {
        ast::CompressionMethod::None => parse_decompressed_swf_file(input),
        ast::CompressionMethod::Deflate => {
          let mut decoder = libflate::zlib::Decoder::new(io::Cursor::new(remaining_input)).unwrap();
          let mut decoded_data: Vec<u8> = vec![67, 87, 83, 8, 255, 184, 0, 0]; // Vec::new();
          decoder.read_to_end(&mut decoded_data).unwrap();
          match parse_decompressed_swf_file(&decoded_data[..]) {
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
