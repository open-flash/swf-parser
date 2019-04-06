#![no_main]
#[macro_use] extern crate libfuzzer_sys;
extern crate swf_parser;

//use swf_parser;
//use swf_tree;

fuzz_target!(|data: &[u8]| {
   let _ = swf_parser::parsers::movie::parse_movie(&data[..]);
});
