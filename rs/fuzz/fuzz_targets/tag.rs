#![no_main]

use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
  if let Some((swf_version, data)) = data.split_first() {
    let _ = swf_parser::complete::parse_tag(data, *swf_version);
  }
});
