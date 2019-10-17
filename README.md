<a href="https://github.com/open-flash/open-flash">
    <img src="https://raw.githubusercontent.com/open-flash/open-flash/master/logo.png"
    alt="Open Flash logo" title="Open Flash" align="right" width="64" height="64" />
</a>

# SWF Parser

[![npm](https://img.shields.io/npm/v/swf-parser.svg)](https://www.npmjs.com/package/swf-parser)
[![crates.io](https://img.shields.io/crates/v/swf-parser.svg)](https://crates.io/crates/swf-parser)
[![GitHub repository](https://img.shields.io/badge/Github-open--flash%2Fswf--parser-blue.svg)](https://github.com/open-flash/swf-parser)
[![Build status](https://img.shields.io/travis/com/open-flash/swf-parser/master.svg)](https://travis-ci.com/open-flash/swf-parser)

SWF parser implemented in Rust and Typescript (Node and browser).
Converts bytes to [`swf-tree` movies][swf-tree].

- [Rust implementation](./rs/README.md)
- [Typescript implementation](./ts/README.md)

This library is part of the [Open Flash][ofl] project.

## Usage

- [Rust](./rs/README.md#usage)
- [Typescript](./ts/README.md#usage)

## Goal

The goal is to provide a complete SWF parser. The initial implementation
requires the movie to be fully buffered before parsing but incremental
parsing (for streams) is planned.
This parser should be easily embeddable: it is intended for SWF players,
analysis tools or any other project having to manipulate SWF files.

## Status

Ready for use.

The Rust and Typescript implementations are kept in sync. They both have
complete support for SWF file format specification.
Help is welcome to improve ergonomics and performance of the parser.

## Contributing

Each implementation lives in its own directory (`rs` or `ts`). The commands
must be executed from these "project roots", not from the "repo root".

Check the implementation-specific guides:

- [Rust](./rs/README.md#contributing)
- [Typescript](./ts/README.md#contributing)

You can also use the library and report any issues you encounter on the Github
issues page.

[ofl]: https://github.com/open-flash/open-flash
[swf-tree]: https://github.com/open-flash/swf-tree
