<a href="https://github.com/open-flash/open-flash">
    <img src="https://raw.githubusercontent.com/open-flash/open-flash/master/logo.png"
    alt="Open Flash logo" title="Open Flash" align="right" width="64" height="64" />
</a>

# SWF Parser

[![GitHub repository](https://img.shields.io/badge/GitHub-open--flash%2Fswf--parser-informational.svg)](https://github.com/open-flash/swf-parser)

SWF parser implemented in Rust and Typescript (Node and browser).
Converts bytes to [`swf-types` movies][swf-types].

<table>
<thead>
  <tr>
    <th>Implementation</th>
    <th>Package</th>
    <th>Checks</th>
    <th>Documentation</th>
  </tr>
</thead>
<tbody>
  <tr>
    <td>
      <a href="./rs/README.md">Rust</a>
    </td>
    <td>
      <a href="https://crates.io/crates/swf-parser"><img src="https://img.shields.io/crates/v/swf-parser" alt="crates.io crate"/></a>
    </td>
    <td>
      <a href="https://github.com/open-flash/swf-parser/actions/workflows/check-rs.yml"><img src="https://img.shields.io/github/workflow/status/open-flash/swf-parser/check-rs/main"  alt="Rust checks status"/></a>
    </td>
    <td>
      <a href="https://docs.rs/swf-parser"><img src="https://img.shields.io/badge/docs.rs-swf--parser-informational" alt="docs.rs/swf-parser"></a>
    </td>
  </tr>
  <tr>
    <td>
      <a href="./ts/README.md">TypeScript</a>
    </td>
    <td>
      <a href="https://www.npmjs.com/package/swf-parser"><img src="https://img.shields.io/npm/v/swf-parser" alt="npm package"/></a>
    </td>
    <td>
      <a href="https://github.com/open-flash/swf-parser/actions/workflows/check-ts.yml"><img src="https://img.shields.io/github/workflow/status/open-flash/swf-parser/check-ts/main"  alt="TypeScript checks status"/></a>
    </td>
    <td>
      <a href="./ts/src/lib">Source Code ¯\_(ツ)_/¯</a>
    </td>
  </tr>
</tbody>
</table>

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
[swf-types]: https://github.com/open-flash/swf-types
