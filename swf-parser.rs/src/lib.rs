extern crate libflate;
#[macro_use]
extern crate nom;
extern crate num_traits;
extern crate ordered_float;
extern crate serde;
#[macro_use]
extern crate serde_derive;
extern crate serde_json;
extern crate swf_tree;

pub mod parsers {
  pub mod avm1;
  pub mod basic_data_types;
  pub mod shapes;
  pub mod swf_file;
  pub mod swf_header;
  pub mod tags;
  pub mod text;
}
