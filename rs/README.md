<a href="https://github.com/open-flash/open-flash">
    <img src="https://raw.githubusercontent.com/open-flash/open-flash/master/logo.png"
    alt="Open Flash logo" title="Open Flash" align="right" width="64" height="64" />
</a>

# SWF Parser

[![crates.io](https://img.shields.io/crates/v/swf-parser.svg?maxAge=86400)](https://crates.io/crates/swf-parser)
[![GitHub repository](https://img.shields.io/badge/Github-open--flash%2Fswf--parser-blue.svg?maxAge=86400)](https://github.com/open-flash/swf-parser)
[![Build status](https://img.shields.io/travis/open-flash/swf-parser/master.svg?maxAge=86400)](https://travis-ci.org/open-flash/swf-parser)

SWF parser implemented in Rust.
Converts bytes to [`swf-tree` movies][swf-tree].

## Usage

```rust
use swf_parser;
use swf_tree;

fn main() {
  let bytes: &[u8] = ...;
  let (_, movie): (_, swf_tree::Movie) = swf_parser::parsers::movie::parse_movie(&bytes[..])
  .expect("Failed to parse movie");
}
```

## Contributing

This repo uses Git submodules for its test samples:

```sh
# Clone with submodules
git clone --recurse-submodules git://github.com/open-flash/swf-parser.git
# Update submodules for an already-cloned repo
git submodule update --recursive --remote
```

This library is a standard Cargo project. You can test your changes with
`cargo test`.

The Rust implementation supports fuzzing:

```
# Make sure that you have `cargo-fuzz`
cargo install cargo-fuzz
# Fuzz the `movie` parser
cargo fuzz run movie
```

Prefer non-`master` branches when sending a PR so your changes can be rebased if
needed. All the commits must be made on top of `master` (fast-forward merge).
CI must pass for changes to be accepted.

[swf-tree]: https://github.com/open-flash/swf-tree
