use nom::{IResult as NomResult};
use swf_tree as ast;

/// Parse a fully loaded movie
pub fn parse_movie(input: &[u8]) -> NomResult<&[u8], ast::Movie> {
  use nom::combinator::complete;
  complete(crate::streaming::movie::parse_movie)(input)
}
