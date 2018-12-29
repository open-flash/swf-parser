extern crate inflate;
#[macro_use]
extern crate nom;
extern crate num_traits;
extern crate serde;
#[macro_use]
extern crate serde_derive;
extern crate serde_json;
extern crate swf_tree;

pub mod parsers {
  pub mod avm1;
  pub mod basic_data_types;
  pub mod display;
  pub mod gradient;
  pub mod shapes;
  pub mod movie;
  pub mod header;
  pub mod tags;
  pub mod text;
}

pub mod state;
