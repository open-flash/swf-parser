use serde::{Serialize, Serializer, Deserialize, Deserializer};
use serde::de::Visitor;
use std::fmt;

macro_rules! signed_fixed_point_impl {
  ($name:ident, $epsilon_type:ty, $int_bits:expr, $frac_bits:expr) => {

    #[derive(PartialEq, Eq)]
    pub struct $name {
      epsilon: $epsilon_type,
    }

    impl $name {
      pub fn from_epsilons(epsilon: $epsilon_type) -> $name {
        $name {epsilon: epsilon}
      }
    }

    impl fmt::Debug for $name {
      fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
          f,
          "{}0x{:0int_width$x}.{:0frac_width$x}",
          if self.epsilon < 0 {"-"} else {"+"},
          self.epsilon >> $frac_bits,
          self.epsilon & ((1 << $frac_bits) - 1),
          int_width = $int_bits / 4,
          frac_width = $frac_bits / 4,
        )
      }
    }

    impl Serialize for $name {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        serializer.serialize_str(&format!("{:?}", self))
      }
    }

    impl<'a> Deserialize<'a> for $name {
      fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D: Deserializer<'a> {
        use serde::de;
        use regex::Regex;

        struct FixedPointVisitor;

        impl<'b> Visitor<'b> for FixedPointVisitor {
          type Value = $name;

          fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a string following the pattern ^[+-]0x[0-9a-f]+\\.[0-9a-f]+$")
          }

          fn visit_str<E>(self, value: &str) -> Result<$name, E> where E: de::Error {
            lazy_static! {
              // TODO(demurgos): The number of digits should be based on the number of bits
              static ref FIXED_POINT_RE: Regex = Regex::new("^([+-])0x([0-9a-f]{2,4})\\.([0-9a-f]{2,4})$").unwrap();
            }
            match FIXED_POINT_RE.captures(value) {
              Some(caps) => {
                let sign: $epsilon_type = if &caps[1] == "-" {-1} else {1};
                let int_part: $epsilon_type = i64::from_str_radix(&caps[2], 16).unwrap() as $epsilon_type;
                let frac_part: $epsilon_type = i64::from_str_radix(&caps[3], 16).unwrap() as $epsilon_type;
                Ok($name::from_epsilons((sign * int_part << $frac_bits) + sign * frac_part))
              },
              None => Err(E::custom(format!("Invalid fixed point: {}", value))),
            }
          }
        }

        deserializer.deserialize_str(FixedPointVisitor)
      }
    }
  }
}

macro_rules! unsigned_fixed_point_impl {
  ($name:ident, $epsilon_type:ty, $int_bits:expr, $frac_bits:expr) => {

    #[derive(PartialEq, Eq)]
    pub struct $name {
      epsilon: $epsilon_type,
    }

    impl $name {
      pub fn from_epsilons(epsilon: $epsilon_type) -> $name {
        $name {epsilon: epsilon}
      }
    }

    impl fmt::Debug for $name {
      fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
          f,
          "+0x{:0int_width$x}.{:0frac_width$x}",
          self.epsilon >> $frac_bits,
          self.epsilon & ((1 << $frac_bits) - 1),
          int_width = $int_bits / 4,
          frac_width = $frac_bits / 4,
        )
      }
    }

    impl Serialize for $name {
      fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error> where S: Serializer {
        serializer.serialize_str(&format!("{:?}", self))
      }
    }

    impl<'a> Deserialize<'a> for $name {
      fn deserialize<D>(deserializer: D) -> Result<Self, D::Error> where D: Deserializer<'a> {
        use serde::de;
        use regex::Regex;

        struct FixedPointVisitor;

        impl<'b> Visitor<'b> for FixedPointVisitor {
          type Value = $name;

          fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a string following the pattern ^[+-]0x[0-9a-f]+\\.[0-9a-f]+$")
          }

          fn visit_str<E>(self, value: &str) -> Result<$name, E> where E: de::Error {
            lazy_static! {
              static ref FIXED_POINT_RE: Regex = Regex::new("^+0x([0-9a-f]{2,4})\\.([0-9a-f]{2,4})$").unwrap();
            }
            match FIXED_POINT_RE.captures(value) {
              Some(caps) => {
                let int_part: $epsilon_type = u64::from_str_radix(&caps[1], 16).unwrap() as $epsilon_type;
                let frac_part: $epsilon_type = u64::from_str_radix(&caps[2], 16).unwrap() as $epsilon_type;
                Ok($name::from_epsilons((int_part << $frac_bits) + frac_part))
              },
              None => Err(E::custom(format!("Invalid fixed point: {}", value))),
            }
          }
        }

        deserializer.deserialize_str(FixedPointVisitor)
      }
    }
  }
}

signed_fixed_point_impl!(Fixed8P8, i16, 8, 8);
signed_fixed_point_impl!(Fixed16P16, i32, 16, 16);
unsigned_fixed_point_impl!(Ufixed8P8, u16, 8, 8);
unsigned_fixed_point_impl!(Ufixed16P16, u32, 16, 16);

#[cfg(test)]
mod tests {
  use super::Fixed16P16;
  use serde_json;
  use std::fmt::Write;

  #[test]
  fn test_eq() {
    assert_eq!(Fixed16P16::from_epsilons(3), Fixed16P16::from_epsilons(3));
  }

  #[test]
  fn test_json_serde_serialization() {
    assert_eq!(serde_json::to_string(&Fixed16P16::from_epsilons(3)).unwrap(), "\"+0x0000.0003\"");
  }

  #[test]
  fn test_json_serde_deserialization() {
    assert_eq!(serde_json::from_str::<Fixed16P16>("\"+0x0000.0000\"").unwrap(), Fixed16P16::from_epsilons(0));
    assert_eq!(serde_json::from_str::<Fixed16P16>("\"+0x0000.0003\"").unwrap(), Fixed16P16::from_epsilons(3));
    assert_eq!(serde_json::from_str::<Fixed16P16>("\"+0x0001.0000\"").unwrap(), Fixed16P16::from_epsilons(65536));
    assert_eq!(serde_json::from_str::<Fixed16P16>("\"+0x7fff.ffff\"").unwrap(), Fixed16P16::from_epsilons(2147483647));
    assert_eq!(serde_json::from_str::<Fixed16P16>("\"-0x8000.0000\"").unwrap(), Fixed16P16::from_epsilons(-2147483648));
  }
}
