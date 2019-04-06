<a href="https://github.com/open-flash/open-flash">
    <img src="https://raw.githubusercontent.com/open-flash/open-flash/master/logo.png"
    alt="Open Flash logo" title="Open Flash" align="right" width="64" height="64" />
</a>

# SWF Parser (Typescript)

[![npm](https://img.shields.io/npm/v/swf-parser.svg?maxAge=86400)](https://www.npmjs.com/package/swf-parser)
[![GitHub repository](https://img.shields.io/badge/Github-open--flash%2Fswf--parser-blue.svg?maxAge=86400)](https://github.com/open-flash/swf-parser)
[![Build status](https://img.shields.io/travis/open-flash/swf-parser/master.svg?maxAge=86400)](https://travis-ci.org/open-flash/swf-parser)

SWF parser implemented in Typescript, for Node and browsers.
Converts bytes to [`swf-tree` movies][swf-tree].

## Usage

```typescript
import fs from "fs";
import { Movie } from "swf-tree/movie";
import { movieFromBytes } from "swf-parser";

function main(): void {
  const bytes: Uint8Array = fs.readFileSync("movie.swf");
  const movie: Movie = movieFromBytes(bytes);
  console.log(`Successfully parsed movie, tag count: ${movie.tags.length}`);
}

main();
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

Prefer non-`master` branches when sending a PR so your changes can be rebased if
needed. All the commits must be made on top of `master` (fast-forward merge).
CI must pass for changes to be accepted.

[swf-tree]: https://github.com/open-flash/swf-tree
