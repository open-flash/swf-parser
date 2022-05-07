pub mod complete;
mod stream_buffer;
pub mod streaming;

pub use swf_types;

pub use complete::tag::parse_tag;
pub use complete::{parse_swf, SwfParseError};

#[cfg(test)]
mod tests {
  use crate::parse_swf;
  use ::swf_types::Movie;
  use ::test_generator::test_resources;
  use nom::IResult as NomResult;
  use std::io::Write;
  use std::path::Path;

  #[test_resources("../tests/movies/*/")]
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
    let movie_bytes: Vec<u8> = ::std::fs::read(movie_path).expect("Failed to read movie");

    let actual_movie = parse_swf(&movie_bytes).expect("Failed to parse movie");

    let actual_ast_path = path.join("local-ast.rs.json");
    let actual_ast_file = ::std::fs::File::create(actual_ast_path).expect("Failed to create actual AST file");
    let actual_ast_writer = ::std::io::BufWriter::new(actual_ast_file);

    let mut ser = serde_json_v8::Serializer::pretty(actual_ast_writer);
    actual_movie.serialize(&mut ser).expect("Failed to write actual AST");
    ser.into_inner().write_all(b"\n").unwrap();

    // assert_eq!(remaining_input, &[] as &[u8]);

    let ast_path = path.join("ast.json");
    let ast_file = ::std::fs::File::open(ast_path).expect("Failed to open AST");
    let ast_reader = ::std::io::BufReader::new(ast_file);
    let expected_movie = serde_json_v8::from_reader::<_, Movie>(ast_reader).expect("Failed to read AST");

    assert_eq!(actual_movie, expected_movie);
  }

  macro_rules! test_various_parser_impl_any {
    ($(#[$meta:meta])* $name:ident<$type:ty>, $parser:path, $check: expr $(,)?) => {
      $(#[$meta])*
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

        let (remaining_bytes, actual_value): (&[u8], $type) = ($parser)(&input_bytes).expect("Failed to parse");

        let expected_path = path.join("value.json");
        let expected_file = ::std::fs::File::open(expected_path).expect("Failed to open expected value file");
        let expected_reader = ::std::io::BufReader::new(expected_file);
        let expected_value = serde_json_v8::from_reader::<_, $type>(expected_reader).expect("Failed to read AST");

        #[allow(clippy::redundant_closure_call)]
        ($check)(actual_value, expected_value);
        assert_eq!(remaining_bytes, &[] as &[u8]);
      }
    };
  }

  macro_rules! test_various_parser_impl_eq {
    ($(#[$meta:meta])* $name:ident<$type:ty>, $parser:path $(,)?) => {
      test_various_parser_impl_any!(
        $(#[$meta])* $name<$type>,
        $parser,
        |actual_value, expected_value| { assert_eq!(actual_value, expected_value) },
      );
    };
  }

  macro_rules! test_various_parser_impl_is {
    ($(#[$meta:meta])* $name:ident<$type:ty>, $parser:path $(,)?) => {
      test_various_parser_impl_any!(
        $(#[$meta])* $name<$type>,
        $parser,
        |actual_value: $type, expected_value: $type| { assert!(crate::swf_types::float_is::Is::is(&actual_value, &expected_value)) },
      );
    };
  }

  test_various_parser_impl_is!(
    #[test_resources("../tests/various/float16-le/*/")] test_parse_le_f16<f32>,
    crate::streaming::basic_data_types::parse_le_f16,
  );

  test_various_parser_impl_eq!(
    #[test_resources("../tests/various/matrix/*/")] test_parse_matrix<swf_types::Matrix>,
    crate::streaming::basic_data_types::parse_matrix,
  );

  fn parse_header34(input: &[u8]) -> NomResult<&[u8], swf_types::Header> {
    crate::streaming::movie::parse_header(input, 34)
  }

  test_various_parser_impl_eq!(
    #[test_resources("../tests/various/header/*/")] test_parse_header<swf_types::Header>,
    parse_header34,
  );

  test_various_parser_impl_eq!(
    #[test_resources("../tests/various/rect/*/")] test_parse_rect<swf_types::Rect>,
    crate::streaming::basic_data_types::parse_rect,
  );

  test_various_parser_impl_eq!(
    #[test_resources("../tests/various/swf-signature/*/")] test_parse_swf_signature<swf_types::SwfSignature>,
    crate::streaming::movie::parse_swf_signature,
  );

  test_various_parser_impl_eq!(
    #[test_resources("../tests/various/uint32-leb128/*/")] test_parse_leb128_u32<u32>,
    crate::streaming::basic_data_types::parse_leb128_u32,
  );
}
