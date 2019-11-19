use nom::IResult as NomResult;

/// Creates a parser skipping `count` bytes.
pub(crate) fn skip<C, I, E: nom::error::ParseError<I>>(count: C) -> impl Fn(I) -> NomResult<I, (), E>
where
  I: nom::InputIter + nom::InputTake,
  C: nom::ToUsize,
{
  use nom::bytes::complete::take;
  use nom::combinator::map;
  map(take(count), |_| ())
}

/// Take with an offset
pub(crate) fn offset_take<C, I, E: nom::error::ParseError<I>>(offset: C, count: C) -> impl Fn(I) -> NomResult<I, I, E>
where
  I: nom::InputIter + nom::InputTake,
  C: nom::ToUsize,
{
  let offset = offset.to_usize();
  let count = count.to_usize();
  move |i: I| match i.slice_index(offset) {
    None => Err(nom::Err::Error(nom::error::ParseError::from_error_kind(
      i,
      nom::error::ErrorKind::Eof,
    ))),
    Some(index) => {
      let (suffix, _) = i.take_split(index);
      match suffix.slice_index(count) {
        None => Err(nom::Err::Error(nom::error::ParseError::from_error_kind(
          i,
          nom::error::ErrorKind::Eof,
        ))),
        Some(index) => Ok(suffix.take_split(index)),
      }
    }
  }
}
