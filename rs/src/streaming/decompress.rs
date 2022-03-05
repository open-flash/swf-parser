use std::borrow::Cow;
use std::error::Error;

type Output<'a> = (&'a [u8], Cow<'a, [u8]>);

// TODO: return NomError::Incomplete on incomplete inputs?

pub(crate) fn decompress_none(bytes: &[u8]) -> Result<Output<'_>, Box<dyn Error>> {
  Ok((&[][..], bytes.into()))
}

#[cfg(feature="deflate")]
pub(crate) fn decompress_zlib(bytes: &[u8]) ->Result<Output<'_>, Box<dyn Error>> {
  let out = inflate::inflate_bytes_zlib(bytes).map_err(|msg| {
    Box::<dyn Error>::from(msg)
  })?;
  Ok((&[][..], out.into()))
}

#[cfg(feature="lzma")]
pub(crate) fn decompress_lzma(mut bytes: &[u8]) -> Result<Output<'_>, Box<dyn Error>> {
  let mut out = Vec::new();
  lzma_rs::lzma_decompress(&mut bytes, &mut out).map_err(Box::new)?;
  Ok((bytes, out.into()))
}
