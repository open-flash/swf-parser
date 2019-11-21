use std::env;
use std::fs::File;
use std::io::prelude::*;

extern crate swf_parser;

use swf_parser::complete::parse_swf;

use swf_tree as ast;

fn main() {
  let args: Vec<String> = env::args().collect();
  if args.len() < 2 {
    println!("Missing input path");
    return;
  }

  let file_path = &args[1];
  //  println!("Reading file: {}", filename);

  let mut file = File::open(file_path).expect("File not found");
  let mut data: Vec<u8> = Vec::new();
  file.read_to_end(&mut data).expect("Unable to read file");

  //  println!("Input:\n{:?}", &data);

  let movie: ast::Movie = parse_swf(&data[..]).expect("Failed to parse movie");
  println!("{}", serde_json_v8::to_string_pretty(&movie).unwrap());
}
