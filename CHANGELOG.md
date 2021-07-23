# 0.13.0 (2021-07-23)

## Rust

- **[Breaking change]** Update to `swf-types@0.13`.
- **[Breaking change]** Update to `nom@6`.
- **[Fix]** Update dependencies.

## Typescript

- **[Breaking change]** Update to `swf-types@0.13`.
- **[Breaking change]** Drop `lib` prefix and `.js` extension from deep-imports.
- **[Fix]** Update dependencies.

# 0.12.0 (2020-09-05)

- **[Breaking change]** Update to `swf-types@0.12`.

## Rust

- **[Fix]** Don't enable `use-serde` feature from `swf-types` by default.

## Typescript

- **[Breaking change]** Update to native ESM.
- **[Internal]** Switch from `tslint` to `eslint`.

# 0.11.0 (2020-02-05)

- **[Breaking change]** Update to `swf-types@0.11`.
- **[Fix]** Update dependencies.

# 0.10.0 (2020-01-16)

- **[Breaking change]** Refactor consumer API. The library now exports a function named
  `parseSwf` (TS) or `parse_swf` (Rust) at its root ([#11](https://github.com/open-flash/swf-parser/issues/11)).
- **[Breaking change]** Update to `swf-types@0.10` (new `swf-tree`).
- **[Breaking change]** Make the parsers stateless by parsing font alignment zones based on available input instead of memorized glyph count.
- **[Feature]** Add invalid tag error recovery.

## Rust

- **[Feature]** Add experimental streaming parser.
- **[Fix]** Remove `nom` macros.
- **[Fix]** Add `clippy` support.
- **[Fix]** **Fix panics found with fuzzing.**
- **[Fix]** Propagate string encoding errors.
- **[Fix]** Fix panic on invalid image type.
- **[Fix]** Fix panic on incomplete `DefineBitsLossless`.
- **[Fix]** Fix panic on unknown audio codec code.
- **[Fix]** Fix panic on invalid CSM text settings.
- **[Fix]** Fix panic on incomplete clip action string.
- **[Fix]** Fix panic on failed image dimension detection.
- **[Fix]** Fix panic on invalid button cond action string.
- **[Fix]** Fix panic on invalid video deblocking.
- **[Fix]** Fix panic on invalid define font offset.
- **[Fix]** Fix panic on invalid button cond key press code.
- **[Fix]** Fix panic on unpaired morph shape record.
- **[Fix]** Fix panic on invalid morph gradient.
- **[Fix]** Fix panic on invalid cap style.
- **[Fix]** Fix panic on unmatched morph shape record pair.
- **[Fix]** Fix panic on invalid GIF or PNG header.
- **[Fix]** Fix panic on text definition with invalid index or advance bits.
- **[Fix]** Fix panic on invalid JPEG data.
- **[Fix]** Remove unused dependencies.

## Typescript

- **[Fix]** Fix pre-release npm tag.
- **[Fix]** Detect invalid UTF-8.
- **[Fix]** Detect invalid `DefineGlyphFont` offsets.

# 0.9.0 (2019-10-17)

- **[Breaking change]** Update to `swf-tree@0.9`.
- **[Feature]** Implement parser for `DefineButton` (thanks [@pheki](https://github.com/pheki)) ([#31](https://github.com/open-flash/swf-parser/issues/31)).
- **[Feature]** Implement parser for `DefineButtonSound` ([#34](https://github.com/open-flash/swf-parser/issues/34)).
- **[Feature]** Implement parser for `DefineText2` ([#37](https://github.com/open-flash/swf-parser/issues/37)).
- **[Feature]** Implement parser for `DefineButtonColorTransform` ([#35](https://github.com/open-flash/swf-parser/issues/35)).
- **[Feature]** Implement parser for `EnablePostscript` ([#92](https://github.com/open-flash/swf-parser/issues/92)).
- **[Feature]** Implement parser for `DefineVideoStream` ([#40](https://github.com/open-flash/swf-parser/issues/40)).
- **[Feature]** Implement parser for `VideoFrame` ([#41](https://github.com/open-flash/swf-parser/issues/41)).
- **[Feature]** Implement parser for `SetTabIndex` ([#44](https://github.com/open-flash/swf-parser/issues/44)).
- **[Feature]** Implement parser for `DefineCffFont` ([#48](https://github.com/open-flash/swf-parser/issues/48)).
- **[Feature]** Implement parser for `EnableDebugger` ([#39](https://github.com/open-flash/swf-parser/issues/39), [#43](https://github.com/open-flash/swf-parser/issues/43)).
- **[Feature]** Implement parser for `DefineFontInfo2` ([#42](https://github.com/open-flash/swf-parser/issues/42)).
- **[Feature]** Implement parser for `Telemetry` ([#49](https://github.com/open-flash/swf-parser/issues/49)).
- **[Feature]** Implement parser for `DefineBitsJpeg4` ([#47](https://github.com/open-flash/swf-parser/issues/47)).

### Typescript

- **[Fix]** Fix `SoundInfo` parser.

# 0.8.0 (2019-07-08)

- **[Breaking change]** Update to `swf-tree@0.8`.

### Rust

- **[Fix]** Update to `nom@5` ([#83](https://github.com/open-flash/swf-parser/issues/83)).

# 0.7.1 (2019-07-06)

- **[Feature]** Implement parser for `Protect` ([#36](https://github.com/open-flash/swf-parser/issues/36)).
- **[Feature]** Implement parser for `DefineFont` ([#32](https://github.com/open-flash/swf-parser/issues/32)).
- **[Feature]** Implement parser for `DefineFontInfo` ([#33](https://github.com/open-flash/swf-parser/issues/33)).
- **[Fix]** Fix support for non-extended (SWF version < 6) clip actions in `PlaceObject2`.
- **[Internal]** Migrate CI to `travis-ci.com`.

### Rust

- **[Internal]** Add `rustfmt` support (thanks [@pheki](https://github.com/pheki)) ([#25](https://github.com/open-flash/swf-parser/issues/25))

# 0.7.0 (2019-05-21)

- **[Breaking change]** Update to `swf-tree@0.7`.

# 0.5.4 (2019-05-20)

- **[Feature]** Implement parser for `DefineFont2` ([#38](https://github.com/open-flash/swf-parser/issues/38)).
- **[Internal]** Update `Contributing` sections in `README.md`.

### Typescript

- **[Internal]** Update build tools.

# 0.5.3 (2019-05-05)

- **[Feature]** Implement parser for `DefineBinaryData` (thanks [@dmarcuse](https://github.com/dmarcuse)).
- **[Fix]** Parse PNG integers as big endians.

### Rust

- **[Fix]** Stop at end of block or nul byte (whichever comes first) when parsing `DefineFont3`.

### Typescript

- **[Internal]** Update build tools.

# 0.5.2 (2019-04-26)

- **[Fix]** Ensure `align` is always defined in `DefineDynamicText`.
- **[Internal]** Update test samples.

### Rust

- **[Fix]** Fix support for `PlaceObject1` with `ColorTransform`.

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
