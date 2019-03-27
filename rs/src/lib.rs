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
