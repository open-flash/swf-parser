use nom::IResult as NomResult;

/// Creates a parser skipping `count` bytes.
pub(crate) fn skip<C, I, E: nom::error::ParseError<I>>(count: C) -> impl Fn(I) -> NomResult<I, (), E>
  where
    I: nom::InputIter + nom::InputTake,
    C: nom::ToUsize,
{
  use nom::combinator::map;
  use nom::bytes::complete::take;
  map(take(count), |_| ())
}
