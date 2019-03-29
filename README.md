# SWF Parser

This project provides Rust and Typescript parsers for SWF files.
The parsers emit AST nodes as defined in [SWF Tree](https://github.com/open-flash/swf-tree).

The goal is to provide a complete parser producing a documented AST. It should be possible to
perform incremental stream parsing (= while downloading the SWF file), but this feature is not
implemented yet.
This parser should be easily embeddable, either in a Flash Player or in other kinds of projects.

Current status: Still a prototype.
Both implementations support parsing of the general structure of SWF files (compressed or not),
shapes, styles and AVM1 actions. The Rust parser also partially supports font definitions.

You can check the test directory for some examples of output (`*.expected.json`).

The test samples are defined in Git submodules. To run the tests, you need to make sure that
the Git submodules are up-to-date:

```sh
git submodule update --recursive --remote
```
