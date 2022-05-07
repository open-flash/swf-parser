<a href="https://github.com/open-flash/open-flash">
    <img src="https://raw.githubusercontent.com/open-flash/open-flash/master/logo.png"
    alt="Open Flash logo" title="Open Flash" align="right" width="64" height="64" />
</a>

# SWF Parser (Rust)

[![GitHub repository](https://img.shields.io/badge/GitHub-open--flash%2Fswf--parser-informational.svg)](https://github.com/open-flash/swf-parser)
<a href="https://crates.io/crates/swf-parser"><img src="https://img.shields.io/crates/v/swf-parser" alt="crates.io crate"/></a>
<a href="https://github.com/open-flash/swf-parser/actions/workflows/check-rs.yml"><img src="https://img.shields.io/github/workflow/status/open-flash/swf-parser/check-rs/main"  alt="Rust checks status"/></a>
<a href="https://docs.rs/swf-parser"><img src="https://img.shields.io/badge/docs.rs-swf--parser-informational" alt="docs.rs/swf-parser"></a>

SWF parser implemented in Rust.
Converts bytes to [`swf-types` movies][swf-types].

## Usage

```rust
use swf_parser::parse_swf;
use swf_types::Movie;

fn main() {
  let swf_bytes: Vec<u8> = ::std::fs::read("movie.swf").expect("Failed to read movie");
  let movie: Movie = parse_swf(&swf_bytes).expect("Failed to parse SWF");
}
```

## Features

SWF decompression is provided by the following features, enabled by default:

- `deflate`: enable support for `CompressionMethod::Deflate`, using the [`inflate`](https://github.com/image-rs/inflate) crate.
- `lzma`: enable support for `CompressionMethod::Lzma`, using the [`lzma-rs`](https://github.com/gendx/lzma-rs) crate.

Disabling these features will cause the SWF parsing functions to fail when passed the corresponding `CompressionMethod`.

## Contributing

This repo uses Git submodules for its test samples:

```sh
# Clone with submodules
git clone --recurse-submodules git://github.com/open-flash/swf-parser.git
# Update submodules for an already-cloned repo
git submodule update --init --recursive --remote
```

This library is a standard Cargo project. You can test your changes with
`cargo test`.  **The commands must be run from the `rs` directory.**

## Fuzzing

The Rust implementation supports fuzzing:

```
# Make sure that you have `cargo-fuzz`
cargo install cargo-fuzz
# Fuzz the `swf` parser
cargo fuzz run swf
```

Prefer non-`master` branches when sending a PR so your changes can be rebased if
needed. All the commits must be made on top of `master` (fast-forward merge).
CI must pass for changes to be accepted.

[swf-types]: https://github.com/open-flash/swf-types
