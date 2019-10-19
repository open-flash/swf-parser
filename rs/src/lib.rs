extern crate inflate;
extern crate nom;
extern crate num_traits;
extern crate swf_fixed;
extern crate swf_tree;

pub mod parsers {
  pub mod basic_data_types;
  pub mod button;
  pub mod display;
  pub mod gradient;
  pub mod header;
  pub mod image;
  pub mod morph_shape;
  pub mod movie;
  pub mod shape;
  pub mod sound;
  pub mod text;
  pub mod video;
}
pub mod state;
pub(crate) mod complete {
  pub(crate) mod tag;
}
pub mod streaming {
  pub mod tag;
}

#[cfg(test)]
mod tests {
  use std::io::{Read, Write};
  use std::path::Path;

  use ::swf_tree::Movie;
  use nom::IResult as NomResult;
  use swf_tree::Tag;

  use ::test_generator::test_expand_paths;

  use crate::parsers::movie::parse_movie;
  use crate::state::ParseState;
  use crate::streaming::tag::parse_tag;

  test_expand_paths! { test_parse_movie; "../tests/movies/*/" }
  fn test_parse_movie(path: &str) {
    use serde::Serialize;

    let path: &Path = Path::new(path);
    let _name = path
      .components()
      .last()
      .unwrap()
      .as_os_str()
      .to_str()
      .expect("Failed to retrieve sample name");
    let movie_path = path.join("main.swf");
    let mut movie_file = ::std::fs::File::open(movie_path).expect("Failed to open movie");
    let mut movie_bytes: Vec<u8> = Vec::new();
    movie_file.read_to_end(&mut movie_bytes).expect("Failed to read movie");

    let (_remaining_input, actual_movie) = parse_movie(&movie_bytes).expect("Failed to parse movie");

    let actual_ast_path = path.join("local-ast.rs.json");
    let actual_ast_file = ::std::fs::File::create(actual_ast_path).expect("Failed to create actual AST file");
    let actual_ast_writer = ::std::io::BufWriter::new(actual_ast_file);

    let mut ser = serde_json_v8::Serializer::pretty(actual_ast_writer);
    actual_movie.serialize(&mut ser).expect("Failed to write actual AST");
    ser.into_inner().write_all("\n".as_bytes()).unwrap();

    // assert_eq!(remaining_input, &[] as &[u8]);

    let ast_path = path.join("ast.json");
    let ast_file = ::std::fs::File::open(ast_path).expect("Failed to open AST");
    let ast_reader = ::std::io::BufReader::new(ast_file);
    let expected_movie = serde_json_v8::from_reader::<_, Movie>(ast_reader).expect("Failed to read AST");

    assert_eq!(actual_movie, expected_movie);
  }

  test_expand_paths! { test_parse_tag; "../tests/tags/*/*/" }
  fn test_parse_tag(path: &str) {
    let path: &Path = Path::new(path);
    let name = path
      .components()
      .last()
      .unwrap()
      .as_os_str()
      .to_str()
      .expect("Failed to retrieve sample name");
    let input_path = path.join("input.bytes");
    let input_bytes: Vec<u8> = ::std::fs::read(input_path).expect("Failed to read input");

    let swf_version: u8 = match name {
      "po2-swf5" => 5,
      _ => 10,
    };

    let mut state = ParseState::new(swf_version);
    state.set_glyph_count(1, 11);
    let (remaining_bytes, actual_value) = parse_tag(&input_bytes, &mut state).expect("Failed to parse");

    let expected_path = path.join("value.json");
    let expected_file = ::std::fs::File::open(expected_path).expect("Failed to open expected value file");
    let expected_reader = ::std::io::BufReader::new(expected_file);
    let expected_value = serde_json_v8::from_reader::<_, Tag>(expected_reader).expect("Failed to read AST");

    assert_eq!(actual_value, expected_value);
    assert_eq!(remaining_bytes, &[] as &[u8]);
  }

  macro_rules! test_various_parser_impl {
    ($name:ident, $glob:expr, $parser:ident, $type:ty) => {
      test_expand_paths! { $name; $glob }
      fn $name(path: &str) {
        let path: &Path = Path::new(path);
        let _name = path
          .components()
          .last()
          .unwrap()
          .as_os_str()
          .to_str()
          .expect("Failed to retrieve sample name");
        let input_path = path.join("input.bytes");
        let input_bytes: Vec<u8> = ::std::fs::read(input_path).expect("Failed to read input");

        let (remaining_bytes, actual_value): (&[u8], $type) = $parser(&input_bytes).expect("Failed to parse");

        let expected_path = path.join("value.json");
        let expected_file = ::std::fs::File::open(expected_path).expect("Failed to open expected value file");
        let expected_reader = ::std::io::BufReader::new(expected_file);
        let expected_value = serde_json_v8::from_reader::<_, $type>(expected_reader).expect("Failed to read AST");

        assert_eq!(actual_value, expected_value);
        assert_eq!(remaining_bytes, &[] as &[u8]);
      }
    };
  }

  use crate::parsers::basic_data_types::parse_le_f16;
  test_various_parser_impl!(test_parse_le_f16, "../tests/various/float16-le/*/", parse_le_f16, f32);

  use crate::parsers::header::parse_header;
  use swf_tree::Header;

  fn parse_header34(input: &[u8]) -> NomResult<&[u8], Header> {
    parse_header(input, 34)
  }
  test_various_parser_impl!(test_parse_header, "../tests/various/header/*/", parse_header34, Header);

  use crate::parsers::basic_data_types::parse_matrix;
  use swf_tree::Matrix;
  test_various_parser_impl!(test_parse_matrix, "../tests/various/matrix/*/", parse_matrix, Matrix);

  use crate::parsers::basic_data_types::parse_rect;
  use swf_tree::Rect;
  test_various_parser_impl!(test_parse_rect, "../tests/various/rect/*/", parse_rect, Rect);

  use crate::parsers::header::parse_swf_signature;
  use swf_tree::SwfSignature;
  test_various_parser_impl!(
    test_parse_swf_signature,
    "../tests/various/swf-signature/*/",
    parse_swf_signature,
    SwfSignature
  );

  use crate::parsers::basic_data_types::parse_leb128_u32;
  test_various_parser_impl!(
    test_parse_leb128_u32,
    "../tests/various/uint32-leb128/*/",
    parse_leb128_u32,
    u32
  );
}
