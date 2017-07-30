use swf_tree as ast;
use swf_tree::fixed_point::{Fixed16P16, Fixed8P8, Ufixed8P8};
use nom::{IResult, Needed};
use nom::{le_u8 as parse_u8, le_i16 as parse_le_i16, le_u16 as parse_le_u16};

named!(
  pub parse_argb<ast::StraightSRgba8>,
  do_parse!(
    a: parse_u8 >>
    r: parse_u8 >>
    g: parse_u8 >>
    b: parse_u8 >>
    (ast::StraightSRgba8 {r: r, g: g, b: b, a: a})
  )
);

/// Parse the bit-encoded representation of a bool (1 bit)
pub fn parse_bool_bits((input_slice, bit_pos): (&[u8], usize)) -> IResult<(&[u8], usize), bool> {
  if input_slice.len() < 1 {
    IResult::Incomplete(Needed::Size(1))
  } else {
    let res: bool = input_slice[0] & (1 << (7 - bit_pos)) > 0;
    if bit_pos == 7 {
      IResult::Done((&input_slice[1..], 0), res)
    } else {
      IResult::Done((input_slice, bit_pos + 1), res)
    }
  }
}

/// Parse a null-terminated sequence of bytes. The null byte is consumed but not included in the
/// result.
named!(
  pub parse_c_string<&[u8], String>,
  map!(take_until_and_consume!("\x00"), |str: &[u8]| String::from_utf8(str.to_vec()).unwrap())
);

/// Parse the variable-length encoded little-endian representation of an unsigned 32-bit integer
pub fn parse_encoded_le_u32(input: &[u8]) -> IResult<&[u8], u32> {
  let mut result: u32 = 0;
  let mut current_input: &[u8] = input;
  for i in 0..5 {
    match parse_u8(current_input) {
      IResult::Done(next_input, next_byte) => {
        result |= ((next_byte as u32) & 0x7f) << (7 * i);
        if next_byte & (1 << 7) == 0 {
          return IResult::Done(next_input, result);
        } else {
          current_input = next_input;
        }
      }
      IResult::Error(e) => return IResult::Error(e),
      IResult::Incomplete(_) => return IResult::Incomplete(Needed::Size(i + 1)),
    }
  }
  IResult::Done(current_input, result)
}

/// Parse the bit-encoded big-endian representation of a signed fixed-point 16.16-bit number
pub fn parse_fixed16_p16_bits(input: (&[u8], usize), n: usize) -> IResult<(&[u8], usize), Fixed16P16> {
  map!(
    input,
    apply!(parse_i32_bits, n),
    |x| Fixed16P16::from_epsilons(x)
  )
}

/// Parse the bit-encoded big-endian representation of a signed fixed-point 8.8-bit number
pub fn parse_fixed8_p8_bits(input: (&[u8], usize), n: usize) -> IResult<(&[u8], usize), Fixed8P8> {
  map!(
    input,
    apply!(parse_i16_bits, n),
    |x| Fixed8P8::from_epsilons(x)
  )
}

/// Parse the bit-encoded big-endian representation of a signed 16-bit integer
pub fn parse_i16_bits(input: (&[u8], usize), n: usize) -> IResult<(&[u8], usize), i16> {
  map!(
    input,
    take_bits!(u16, n),
    |x| match n {
      0 => 0,
      16 => x as i16,
      _ => if x >> (n - 1) > 0 {-1i16 << (n-1) | (x as i16)} else {x as i16}
    }
  )
}

pub fn parse_i32_bits(input: (&[u8], usize), n: usize) -> IResult<(&[u8], usize), i32> {
  map!(
    input,
    take_bits!(u32, n),
    |x| match n {
      0 => 0,
      32 => x as i32,
      _ => if x >> (n - 1) > 0 {-1i32 << (n-1) | (x as i32)} else {x as i32}
    }
  )
}

pub fn parse_u32_bits(input: (&[u8], usize), n: usize) -> IResult<(&[u8], usize), u32> {
  take_bits!(input, u32, n)
}

/// Parse the little-endian representation of an unsigned fixed-point 8.8-bit number
named!(
  pub parse_le_ufixed8_p8<Ufixed8P8>,
  map!(parse_le_u16, |x| Ufixed8P8::from_epsilons(x))
);

/// Parse the little-endian representation of a signed fixed-point 8.8-bit number
named!(
  pub parse_le_fixed8_p8<Fixed8P8>,
  map!(parse_le_i16, |x| Fixed8P8::from_epsilons(x))
);

named!(
  pub parse_rect<ast::Rect>,
  bits!(parse_rect_bits)
);

named!(
  pub parse_rect_bits<(&[u8], usize), ast::Rect>,
  do_parse!(
    n_bits: apply!(parse_u16_bits, 5) >>
    x_min: apply!(parse_i16_bits, n_bits as usize) >>
    x_max: apply!(parse_i16_bits, n_bits as usize) >>
    y_min: apply!(parse_i16_bits, n_bits as usize) >>
    y_max: apply!(parse_i16_bits, n_bits as usize) >>
    (ast::Rect {x_min: x_min, x_max: x_max, y_min: y_min, y_max: y_max})
  )
);

named!(
  pub parse_rgb<ast::SRgb8>,
  do_parse!(
    r: parse_u8 >>
    g: parse_u8 >>
    b: parse_u8 >>
    (ast::SRgb8 {r: r, g: g, b: b})
  )
);

named!(
  pub parse_rgba<ast::StraightSRgba8>,
  do_parse!(
    r: parse_u8 >>
    g: parse_u8 >>
    b: parse_u8 >>
    a: parse_u8 >>
    (ast::StraightSRgba8 {r: r, g: g, b: b, a: a})
  )
);

/// Skip `n` bits
pub fn skip_bits((input_slice, bit_pos): (&[u8], usize), n: usize) -> IResult<(&[u8], usize), ()> {
  let slice_len: usize = input_slice.len();
  let available_bits: usize = 8 * slice_len - bit_pos;
  let skipped_full_bytes = (bit_pos + n) / 8;
  let final_bit_pos = (bit_pos + n) % 8;
  if available_bits < n {
    let needed_bytes = skipped_full_bytes + if final_bit_pos > 0 { 1 } else { 0 };
    IResult::Incomplete(Needed::Size(needed_bytes))
  } else {
    IResult::Done((&input_slice[skipped_full_bytes..], final_bit_pos), ())
  }
}

/// Parse the bit-encoded big-endian representation of an unsigned 16-bit integer
pub fn parse_u16_bits(input: (&[u8], usize), n: usize) -> IResult<(&[u8], usize), u16> {
  take_bits!(input, u16, n)
}

named!(
  pub parse_language_code<&[u8], ast::LanguageCode>,
  switch!(parse_u8,
    0 => value!(ast::LanguageCode::Auto) |
    1 => value!(ast::LanguageCode::Latin) |
    2 => value!(ast::LanguageCode::Japanese) |
    3 => value!(ast::LanguageCode::Korean) |
    4 => value!(ast::LanguageCode::SimplifiedChinese) |
    5 => value!(ast::LanguageCode::TraditionalChinese)
    // TODO(demurgos): Error on unexpected value
  )
);

named!(
  pub parse_matrix<ast::Matrix>,
  bits!(parse_matrix_bits)
);

named!(
  pub parse_matrix_bits<(&[u8], usize), ast::Matrix>,
  do_parse!(
    has_scale: call!(parse_bool_bits) >>
    scale: map!(
      cond!(has_scale, do_parse!(
        scale_bits: apply!(parse_u16_bits, 5) >>
        scale_x: apply!(parse_fixed16_p16_bits, scale_bits as usize) >>
        scale_y: apply!(parse_fixed16_p16_bits, scale_bits as usize) >>
        (scale_x, scale_y)
      )),
      |scale| match scale {
        Some((scale_x, scale_y)) => (scale_x, scale_y),
        None => (Fixed16P16::from_epsilons(1 << 16), Fixed16P16::from_epsilons(1 << 16)),
      }
    ) >>
    has_rotate: call!(parse_bool_bits) >>
    skew: map!(
      cond!(has_rotate, do_parse!(
        skew_bits: apply!(parse_u16_bits, 5) >>
        skew0: apply!(parse_fixed16_p16_bits, skew_bits as usize) >>
        skew1: apply!(parse_fixed16_p16_bits, skew_bits as usize) >>
        (skew0, skew1)
      )),
      |skew| match skew {
        Some((skew0, skew1)) => (skew0, skew1),
        None => (Fixed16P16::from_epsilons(0), Fixed16P16::from_epsilons(0)),
      }
    ) >>
    translate_bits: apply!(parse_u16_bits, 5) >>
    translate_x: apply!(parse_i32_bits, translate_bits as usize) >>
    translate_y: apply!(parse_i32_bits, translate_bits as usize) >>
    (ast::Matrix {
      scale_x: scale.0,
      scale_y: scale.1,
      rotate_skew0: skew.0,
      rotate_skew1: skew.1,
      translate_x: translate_x,
      translate_y: translate_y,
    })
  )
);

named!(
  pub parse_named_id<ast::NamedId>,
  do_parse!(
    id: parse_le_u16 >>
    name: parse_c_string >>
    (ast::NamedId {
      id: id,
      name: name,
    })
  )
);

named!(
  pub parse_color_transform<ast::ColorTransform>,
  bits!(parse_color_transform_bits)
);

named!(
  pub parse_color_transform_bits<(&[u8], usize), ast::ColorTransform>,
  do_parse!(
    has_add: call!(parse_bool_bits) >>
    has_mult: call!(parse_bool_bits) >>
    n_bits: apply!(parse_u16_bits, 4) >>
    mult: map!(
      cond!(has_mult, do_parse!(
        r: apply!(parse_fixed8_p8_bits, n_bits as usize) >>
        g: apply!(parse_fixed8_p8_bits, n_bits as usize) >>
        b: apply!(parse_fixed8_p8_bits, n_bits as usize) >>
        (r, g, b)
      )),
      |mult| match mult {
        Some((r, g, b)) => (r, g, b),
        None => (Fixed8P8::from_epsilons(1 << 8), Fixed8P8::from_epsilons(1 << 8), Fixed8P8::from_epsilons(1 << 8)),
      }
    ) >>
    add: map!(
      cond!(has_mult, do_parse!(
        r: apply!(parse_i16_bits, n_bits as usize) >>
        g: apply!(parse_i16_bits, n_bits as usize) >>
        b: apply!(parse_i16_bits, n_bits as usize) >>
        (r, g, b)
      )),
      |add| match add {
        Some((r, g, b)) => (r, g, b),
        None => (0, 0, 0),
      }
    ) >>
    (ast::ColorTransform {
      red_mult: mult.0,
      green_mult: mult.1,
      blue_mult: mult.2,
      red_add: add.0,
      green_add: add.1,
      blue_add: add.2,
    })
  )
);

named!(
  pub parse_color_transform_with_alpha<ast::ColorTransformWithAlpha>,
  bits!(parse_color_transform_with_alpha_bits)
);

named!(
  pub parse_color_transform_with_alpha_bits<(&[u8], usize), ast::ColorTransformWithAlpha>,
  do_parse!(
    has_add: call!(parse_bool_bits) >>
    has_mult: call!(parse_bool_bits) >>
    n_bits: apply!(parse_u16_bits, 4) >>
    mult: map!(
      cond!(has_mult, do_parse!(
        r: apply!(parse_fixed8_p8_bits, n_bits as usize) >>
        g: apply!(parse_fixed8_p8_bits, n_bits as usize) >>
        b: apply!(parse_fixed8_p8_bits, n_bits as usize) >>
        a: apply!(parse_fixed8_p8_bits, n_bits as usize) >>
        (r, g, b, a)
      )),
      |mult| match mult {
        Some((r, g, b, a)) => (r, g, b, a),
        None => (Fixed8P8::from_epsilons(1 << 8), Fixed8P8::from_epsilons(1 << 8), Fixed8P8::from_epsilons(1 << 8), Fixed8P8::from_epsilons(1 << 8)),
      }
    ) >>
    add: map!(
      cond!(has_mult, do_parse!(
        r: apply!(parse_i16_bits, n_bits as usize) >>
        g: apply!(parse_i16_bits, n_bits as usize) >>
        b: apply!(parse_i16_bits, n_bits as usize) >>
        a: apply!(parse_i16_bits, n_bits as usize) >>
        (r, g, b, a)
      )),
      |add| match add {
        Some((r, g, b, a)) => (r, g, b, a),
        None => (0, 0, 0, 0),
      }
    ) >>
    (ast::ColorTransformWithAlpha {
      red_mult: mult.0,
      green_mult: mult.1,
      blue_mult: mult.2,
      alpha_mult: mult.3,
      red_add: add.0,
      green_add: add.1,
      blue_add: add.2,
      alpha_add: add.3,
    })
  )
);

#[cfg(test)]
mod tests {
  use nom::{IResult, Needed};
  use super::*;

  #[test]
  fn test_parse_encoded_le_u32() {
    {
      assert_eq!(parse_encoded_le_u32(&[][..]), IResult::Incomplete(Needed::Size(1)));
    }
    {
      let input = vec![0x00];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Done(&input[1..], 0));
    }
    {
      let input = vec![0x01];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Done(&input[1..], 1));
    }
    {
      let input = vec![0x10];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Done(&input[1..], 16));
    }
    {
      let input = vec![0x7f];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Done(&input[1..], 127));
    }
    {
      let input = vec![0x80];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Incomplete(Needed::Size(2)));
    }
    {
      let input = vec![0x80, 0x01];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Done(&input[2..], 1 << 7));
    }
    {
      let input = vec![0x80, 0x80, 0x01];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Done(&input[3..], 1 << 14));
    }
    {
      let input = vec![0x80, 0x80, 0x80, 0x01];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Done(&input[4..], 1 << 21));
    }
    {
      let input = vec![0x80, 0x80, 0x80, 0x80];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Incomplete(Needed::Size(5)));
    }
    {
      let input = vec![0x80, 0x80, 0x80, 0x80, 0x01];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Done(&input[5..], 1 << 28));
    }
    {
      // Do not extend past 5 bytes
      let input = vec![0x80, 0x80, 0x80, 0x80, 0x80];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Done(&input[5..], 0));
    }
    {
      // Do not extend past 5 bytes
      let input = vec![0x80, 0x80, 0x80, 0x80, 0x80, 0x01];
      assert_eq!(parse_encoded_le_u32(&input[..]), IResult::Done(&input[5..], 0));
    }
  }

  #[test]
  fn test_parse_i16_bits() {
    {
      let input = vec![0b00000000, 0b00000000];
      assert_eq!(parse_i16_bits((&input[..], 0), 0), IResult::Done((&input[0..], 0), 0));
    }
    {
      let input = vec![0b00000000, 0b00000000];
      assert_eq!(parse_i16_bits((&input[..], 0), 1), IResult::Done((&input[0..], 1), 0));
    }
    {
      let input = vec![0b10000000, 0b00000000];
      assert_eq!(parse_i16_bits((&input[..], 0), 1), IResult::Done((&input[0..], 1), -1));
    }
    {
      let input = vec![0b00000000, 0b00000000];
      assert_eq!(parse_i16_bits((&input[..], 0), 2), IResult::Done((&input[0..], 2), 0));
    }
    {
      let input = vec![0b01000000, 0b00000000];
      assert_eq!(parse_i16_bits((&input[..], 0), 2), IResult::Done((&input[0..], 2), 1));
    }
    {
      let input = vec![0b10000000, 0b00000000];
      assert_eq!(parse_i16_bits((&input[..], 0), 2), IResult::Done((&input[0..], 2), -2));
    }
    {
      let input = vec![0b11000000, 0b00000000];
      assert_eq!(parse_i16_bits((&input[..], 0), 2), IResult::Done((&input[0..], 2), -1));
    }
    {
      let input = vec![0b00000000, 0b00000000];
      assert_eq!(parse_i16_bits((&input[..], 0), 15), IResult::Done((&input[1..], 7), 0));
    }
    {
      let input = vec![0b01111111, 0b11111110];
      assert_eq!(parse_i16_bits((&input[..], 0), 15), IResult::Done((&input[1..], 7), 16383));
    }
    {
      let input = vec![0b10000000, 0b00000000];
      assert_eq!(parse_i16_bits((&input[..], 0), 15), IResult::Done((&input[1..], 7), -16384));
    }
    {
      let input = vec![0b11111111, 0b11111110];
      assert_eq!(parse_i16_bits((&input[..], 0), 15), IResult::Done((&input[1..], 7), -1));
    }
    {
      let input = vec![0b00000000, 0b00000000];
      assert_eq!(parse_i16_bits((&input[..], 0), 16), IResult::Done((&input[2..], 0), 0));
    }
    {
      let input = vec![0b01111111, 0b11111111];
      assert_eq!(parse_i16_bits((&input[..], 0), 16), IResult::Done((&input[2..], 0), 32767));
    }
    {
      let input = vec![0b10000000, 0b00000000];
      assert_eq!(parse_i16_bits((&input[..], 0), 16), IResult::Done((&input[2..], 0), -32768));
    }
    {
      let input = vec![0b11111111, 0b11111111];
      assert_eq!(parse_i16_bits((&input[..], 0), 16), IResult::Done((&input[2..], 0), -1));
    }
  }

  #[test]
  fn test_parse_u16_bits() {
    let input = vec![0b10101010, 0b11110000, 0b00110011];
    assert_eq!(parse_u16_bits((&input[..], 0), 5), IResult::Done((&input[0..], 5), 21));
  }

  #[test]
  fn test_parse_fixed16_p16_bits() {
    let input = vec![0b00000000, 0b00000000, 0b00000000, 0b00000000];
    assert_eq!(parse_fixed16_p16_bits((&input[..], 0), 32), IResult::Done((&input[4..], 0), Fixed16P16::from_epsilons(0)));
  }

  #[test]
  fn test_parse_rect() {
    {
      // This is the example in the spec, but the spec has an error: the binary
      // representations of x_min and x_max are swapped
      // 01011 00001111111 00100000100 00000001111 01000000010
      // nBits xMin        xMax        yMin        yMax
      let input = vec![0b01011000, 0b01111111, 0b00100000, 0b10000000, 0b00111101, 0b00000001, 0b00000000];
      assert_eq!(parse_rect(&input[..]), IResult::Done((&[][..]), ast::Rect { x_min: 127, x_max: 260, y_min: 15, y_max: 514 }));
    }
    {
      let input = vec![0b00000000];
      assert_eq!(parse_rect(&input[..]), IResult::Done((&[][..]), ast::Rect { x_min: 0, x_max: 0, y_min: 0, y_max: 0 }));
    }
    {
      let input = vec![0b00001000, 0b00000000];
      assert_eq!(parse_rect(&input[..]), IResult::Done((&[][..]), ast::Rect { x_min: 0, x_max: 0, y_min: 0, y_max: 0 }));
    }
    {
      let input = vec![0b00010000, 0b00000000];
      assert_eq!(parse_rect(&input[..]), IResult::Done((&[][..]), ast::Rect { x_min: 0, x_max: 0, y_min: 0, y_max: 0 }));
    }
    {
      let input = vec![0b00010010, 0b00000000];
      assert_eq!(parse_rect(&input[..]), IResult::Done((&[][..]), ast::Rect { x_min: 1, x_max: 0, y_min: 0, y_max: 0 }));
    }
    {
      let input = vec![0b00010000, 0b10000000];
      assert_eq!(parse_rect(&input[..]), IResult::Done((&[][..]), ast::Rect { x_min: 0, x_max: 1, y_min: 0, y_max: 0 }));
    }
    {
      let input = vec![0b00010000, 0b00100000];
      assert_eq!(parse_rect(&input[..]), IResult::Done((&[][..]), ast::Rect { x_min: 0, x_max: 0, y_min: 1, y_max: 0 }));
    }
    {
      let input = vec![0b00010000, 0b00001000];
      assert_eq!(parse_rect(&input[..]), IResult::Done((&[][..]), ast::Rect { x_min: 0, x_max: 0, y_min: 0, y_max: 1 }));
    }
  }
}
