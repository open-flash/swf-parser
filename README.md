<a href="https://github.com/open-flash/open-flash">
    <img src="https://raw.githubusercontent.com/open-flash/open-flash/master/logo.png"
    alt="Open Flash logo" title="Open Flash" align="right" width="64" height="64" />
</a>

# SWF Parser

[![npm](https://img.shields.io/npm/v/swf-parser.svg)](https://www.npmjs.com/package/swf-parser)
[![crates.io](https://img.shields.io/crates/v/swf-parser.svg)](https://crates.io/crates/swf-parser)
[![GitHub repository](https://img.shields.io/badge/Github-open--flash%2Fswf--parser-blue.svg)](https://github.com/open-flash/swf-parser)
[![Build status](https://img.shields.io/travis/open-flash/swf-parser/master.svg)](https://travis-ci.org/open-flash/swf-parser)

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

Still experimental but getting better.

The Rust and Typescript implementations are kept in sync. They both support the
following kinds of tags: shape definitions, morph shape definitions, bitmaps,
AVM1 actions, sprites, sound streams, control tags. It represents about two
thirds of the SWF tags and is enough to play simple movies.
Help is welcome to complete the parser.

## Contributing

- [Rust](./rs/README.md#contributing)
- [Typescript](./ts/README.md#contributing)

You can also use the library and report any issues you encounter on the Github
issues page.

[ofl]: https://github.com/open-flash/open-flash
[swf-tree]: https://github.com/open-flash/swf-tree
