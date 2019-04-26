# Next

- **[Fix]** Ensure `align` is always defined in `DefineDynamicText`.

# 0.5.1 (2019-04-24)

- **[Fix]** Fix `TextRecord` flags parsing.

# 0.5.0 (2019-04-22)

- **[Breaking change]** Update to `swf-tree@0.6.0`.
- **[Internal]** Refactor tests.
- **[Internal]** Add `CHANGELOG.md`

### Typescript

- **[Fix]** Inflate zlib payloads with `pako` instead of Node's `zlib` (should improve browser support).

### Rust

- **[Breaking change]** Rename `parse_swf_tag` to `parse_tag`.

# 0.4.0 (2019-04-14)

- **[Breaking change]** Update to `swf-tree@0.5.0`.

# 0.3.2

- **[Fix]** Fix `ButtonCond` parser

# 0.3.1 (2019-04-05)

- **[Fix]** Fix support for `DefineButton2` with multiple `ButtonCondAction`.
- **[Fix]** Update dependencies.
- **[Internal]** Update test samples.

# 0.3.0 (2019-03-30)

- **[Breaking change]** Update to `swf-tree@0.4.x`
- **[Feature]** Implement parsers for the following tags: `DoAbc`, `ScriptLimits`, `SoundBlock`, `SoundHead`, `SoundHead2`, `StartSound`, `StartSound2`, `SymbolClass`
- **[Fix]** Drop JpegTables signature check
- **[Fix]** Update dependencies
- **[Internal]** Add Travis CI integration
- **[Internal]** Update README.md

### Rust

- **[Fix]** Synchronize implementation with Typescript
- **[Fix]** Use pure-Rust libraries for decompression. Thanks @eddyb
- **[Fix]** Accept key code 8 in button cond
- **[Fix]** Keep opaque length in `x-ajpeg` image data
- **[Fix]** Update to Rust 2018
