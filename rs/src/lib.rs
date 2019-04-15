extern crate inflate;
#[macro_use]
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
  pub mod tags;
  pub mod text;
}

pub mod state;


#[cfg(test)]
mod lib_tests {
  use std::io::Read;
  use std::path::Path;

  use ::swf_tree::Movie;
  use swf_tree::Tag;

  use ::test_generator::test_expand_paths;

  use crate::parsers::movie::parse_movie;
  use crate::parsers::tags::parse_swf_tag;
  use crate::state::ParseState;

  test_expand_paths! { test_parse_movie; "../tests/standalone-movies/*/" }
  fn test_parse_movie(path: &str) {
    let path: &Path = Path::new(path);
    let _name = path.components().last().unwrap().as_os_str().to_str().expect("Failed to retrieve sample name");
    let movie_path = path.join("main.swf");
    let mut movie_file = ::std::fs::File::open(movie_path).expect("Failed to open movie");
    let mut movie_bytes: Vec<u8> = Vec::new();
    movie_file.read_to_end(&mut movie_bytes).expect("Failed to read movie");

    let (_remaining_input, actual_movie) = parse_movie(&movie_bytes).expect("Failed to parse movie");

    let actual_ast_path = path.join("tmp-ast.rs.json");
    let actual_ast_file = ::std::fs::File::create(actual_ast_path).expect("Failed to create actual AST file");
    let actual_ast_writer = ::std::io::BufWriter::new(actual_ast_file);
    serde_json::to_writer_pretty(actual_ast_writer, &actual_movie).expect("Failed to write actual AST");

    // assert_eq!(remaining_input, &[] as &[u8]);

    let ast_path = path.join("ast.json");
    let ast_file = ::std::fs::File::open(ast_path).expect("Failed to open AST");
    let ast_reader = ::std::io::BufReader::new(ast_file);
    let expected_movie = serde_json::from_reader::<_, Movie>(ast_reader).expect("Failed to read AST");

    assert_eq!(actual_movie, expected_movie);
  }

  test_expand_paths! { test_parse_tag; "../tests/tags/*/*/" }
  fn test_parse_tag(path: &str) {
    let path: &Path = Path::new(path);
    let _name = path.components().last().unwrap().as_os_str().to_str().expect("Failed to retrieve sample name");
    let input_path = path.join("input.bytes");
    let input_bytes: Vec<u8> = ::std::fs::read(input_path).expect("Failed to read input");

    let mut state = ParseState::new(10);
    let (remaining_bytes, actual_value) = parse_swf_tag(&input_bytes, &mut state).expect("Failed to parse");

    let expected_path = path.join("value.json");
    let expected_file = ::std::fs::File::open(expected_path).expect("Failed to open expected value file");
    let expected_reader = ::std::io::BufReader::new(expected_file);
    let expected_value = serde_json::from_reader::<_, Tag>(expected_reader).expect("Failed to read AST");

    assert_eq!(actual_value, expected_value);
    assert_eq!(remaining_bytes, &[] as &[u8]);
  }

  macro_rules! test_various_parser_impl {
    ($name:ident, $glob:expr, $parser:ident, $type:ty) => {
      test_expand_paths! { $name; $glob }
      fn $name(path: &str) {
        let path: &Path = Path::new(path);
        let _name = path.components().last().unwrap().as_os_str().to_str().expect("Failed to retrieve sample name");
        let input_path = path.join("input.bytes");
        let input_bytes: Vec<u8> = ::std::fs::read(input_path).expect("Failed to read input");

        let (remaining_bytes, actual_value): (&[u8], $type) = $parser(&input_bytes).expect("Failed to parse");

        let expected_path = path.join("value.json");
        let expected_file = ::std::fs::File::open(expected_path).expect("Failed to open expected value file");
        let expected_reader = ::std::io::BufReader::new(expected_file);
        let expected_value = serde_json::from_reader::<_, $type>(expected_reader).expect("Failed to read AST");

        assert_eq!(actual_value, expected_value);
        assert_eq!(remaining_bytes, &[] as &[u8]);
      }
    }
  }

  use crate::parsers::basic_data_types::parse_rect;
  use swf_tree::Rect;
  test_various_parser_impl!(test_parse_rect, "../tests/various/rect/*/", parse_rect, Rect);

  use crate::parsers::basic_data_types::parse_encoded_le_u32;
  test_various_parser_impl!(test_parse_u32_leb128, "../tests/various/uint32-leb128/*/", parse_encoded_le_u32, u32);
}
