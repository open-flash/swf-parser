use std::cell::RefCell;
use std::collections::HashMap;

#[derive(Debug)]
pub struct ParseState {
  swf_version: u8,
  glyph_counts: RefCell<HashMap<usize, usize>>,
}

impl ParseState {
  pub fn new(swf_version: u8) -> ParseState {
    ParseState {
      swf_version,
      glyph_counts: RefCell::new(HashMap::new()),
    }
  }

  pub fn get_glyph_count(&self, font_id: usize) -> Option<usize> {
    self.glyph_counts.borrow().get(&font_id).map(|count| *count)
  }

  pub fn set_glyph_count(&self, font_id: usize, glyph_count: usize) -> () {
    // TODO(demurgos): Use return value to ensure that there was no duplicate insertion?
    self.glyph_counts.borrow_mut().insert(font_id, glyph_count);
  }

  pub fn get_swf_version(&self) -> u8 {
    self.swf_version
  }
}
