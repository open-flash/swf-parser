extern crate inflate;
#[macro_use]
extern crate nom;
extern crate num_traits;
extern crate serde;
extern crate serde_derive;
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
mod parser_tests {
  use std::io::Read;
  use std::path::Path;

  use ::swf_tree::Movie;

  use ::test_generator::test_expand_paths;

  use crate::parsers::movie::parse_movie;

  test_expand_paths! { test_parse_movie; "../tests/open-flash-db/standalone-movies/*/" }
  fn test_parse_movie(path: &str) {
    let path: &Path = Path::new(path);
    let name = path.components().last().unwrap().as_os_str().to_str().unwrap();
    match name {
      "blank" | "homestuck-beta-1" | "homestuck-beta-2" => return,
      _ => (),
    }
    let movie_path = path.join("main.swf");
    let mut movie_file = ::std::fs::File::open(movie_path).unwrap();
    let mut movie_bytes: Vec<u8> = Vec::new();
    movie_file.read_to_end(&mut movie_bytes).expect("Failed to read movie");

    let (_remaining_input, actual_movie) = parse_movie(&movie_bytes).unwrap();

    // assert_eq!(remaining_input, &[] as &[u8]);

    let ast_path = path.join("ast.json");
    let ast_file = ::std::fs::File::open(ast_path).unwrap();
    let ast_reader = ::std::io::BufReader::new(ast_file);
    let expected_movie = serde_json::from_reader::<_, Movie>(ast_reader).unwrap();

    assert_eq!(actual_movie, expected_movie);
  }
}
