use libflate;
use nom::{IResult as NomResult, Needed};
use parsers::header::{parse_header, parse_swf_signature};
use parsers::tags::parse_swf_tag;
use state::ParseState;
use std::io;
use std::io::Read;
use swf_tree as ast;

pub fn parse_tag_block_string<'a>(input: &'a [u8], state: &mut ParseState) -> NomResult<&'a [u8], Vec<ast::Tag>> {
  let mut result: Vec<ast::Tag> = Vec::new();
  let mut current_input: &[u8] = input;
  while current_input.len() > 0 {
    // A null byte indicates the end of the string of actions
    if current_input[0] == 0 {
      current_input = &current_input[1..];
      break;
    }
    match parse_swf_tag(current_input, state) {
      Ok((next_input, swf_tag)) => {
        current_input = next_input;
        result.push(swf_tag);
      }
      Err(::nom::Err::Incomplete(_)) => return Err(::nom::Err::Incomplete(Needed::Unknown)),
      Err(e) => return Err(e),
    };
  }
  Ok((current_input, result))
}

pub fn parse_decompressed_movie(input: &[u8], swf_version: u8) -> NomResult<&[u8], ast::Movie> {
  let mut state = ParseState::new(swf_version);
  do_parse!(
    input,
    header: call!(parse_header, swf_version) >>
    tags: apply!(parse_tag_block_string, &mut state) >>
    (ast::Movie {
      header: header,
      tags: tags,
    })
  )
}

pub fn parse_movie(input: &[u8]) -> NomResult<&[u8], ast::Movie> {
  let (input, signature) = parse_swf_signature(input)?;
  match signature.compression_method {
    ast::CompressionMethod::None => parse_decompressed_movie(input, signature.swf_version),
    ast::CompressionMethod::Deflate => {
      let mut decoder = libflate::zlib::Decoder::new(io::Cursor::new(input)).unwrap();
      let signature_len: usize = 8;
      let mut decoded_data: Vec<u8> = Vec::with_capacity(signature.uncompressed_file_length - signature_len);
      decoder.read_to_end(&mut decoded_data).unwrap();
      match parse_decompressed_movie(&decoded_data[..], signature.swf_version) {
        Ok((_, parsed_swf_file)) => Ok((&[][..], parsed_swf_file)),
        Err(::nom::Err::Error(::nom::simple_errors::Context::Code(_, e))) => Err(::nom::Err::Error(::nom::simple_errors::Context::Code(&[][..], e))),
        Err(::nom::Err::Failure(::nom::simple_errors::Context::Code(_, e))) => Err(::nom::Err::Failure(::nom::simple_errors::Context::Code(&[][..], e))),
        Err(::nom::Err::Incomplete(n)) => Err(::nom::Err::Incomplete(n)),
      }
    }
    ast::CompressionMethod::Lzma => {
      unimplemented!()
    }
  }
}
