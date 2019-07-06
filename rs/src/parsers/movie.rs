use crate::parsers::header::{parse_header, parse_swf_signature};
use crate::parsers::tags::parse_tag;
use crate::state::ParseState;
use nom::{IResult as NomResult, Needed};
use swf_tree as ast;

pub fn parse_tag_block_string<'a>(input: &'a [u8], state: &ParseState) -> NomResult<&'a [u8], Vec<ast::Tag>> {
  let mut result: Vec<ast::Tag> = Vec::new();
  let mut current_input: &[u8] = input;
  while current_input.len() > 0 {
    // TODO: Check two bytes ahead
    // A null byte indicates the end of the string of tags
    if current_input[0] == 0 {
      current_input = &current_input[1..];
      break;
    }
    match parse_tag(current_input, state) {
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

pub fn parse_movie_payload(input: &[u8], swf_version: u8) -> NomResult<&[u8], ast::Movie> {
  let mut state = ParseState::new(swf_version);
  let (input, header) = parse_header(input, swf_version)?;
  let (input, tags) = parse_tag_block_string(input, &mut state)?;

  Ok((input, ast::Movie { header, tags }))
}

pub fn parse_movie(input: &[u8]) -> NomResult<&[u8], ast::Movie> {
  use ::std::io::Write;

  let (input, signature) = parse_swf_signature(input)?;
  match signature.compression_method {
    ast::CompressionMethod::None => parse_movie_payload(input, signature.swf_version),
    ast::CompressionMethod::Deflate => {
      let mut decoder = ::inflate::InflateWriter::from_zlib(Vec::new());
      decoder.write(input).unwrap();
      let payload = decoder.finish().unwrap();

      match parse_movie_payload(&payload[..], signature.swf_version) {
        Ok((_, movie)) => Ok((&[][..], movie)),
        Err(::nom::Err::Error((_, e))) => Err(::nom::Err::Error((&[][..], e))),
        Err(::nom::Err::Failure((_, e))) => Err(::nom::Err::Failure((&[][..], e))),
        Err(::nom::Err::Incomplete(n)) => Err(::nom::Err::Incomplete(n)),
      }
    }
    ast::CompressionMethod::Lzma => unimplemented!(),
  }
}
