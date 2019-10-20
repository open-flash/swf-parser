#![no_main]
#[macro_use] extern crate libfuzzer_sys;
extern crate swf_parser;

fuzz_target!(|data: &[u8]| {
   let _ = swf_parser::complete::parse_swf(data);
});
