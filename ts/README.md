<a href="https://github.com/open-flash/open-flash">
    <img src="https://raw.githubusercontent.com/open-flash/open-flash/master/logo.png"
    alt="Open Flash logo" title="Open Flash" align="right" width="64" height="64" />
</a>

# SWF Parser (TypeScript)

[![GitHub repository](https://img.shields.io/badge/GitHub-open--flash%2Fswf--parser-informational.svg)](https://github.com/open-flash/swf-parser)
<a href="https://www.npmjs.com/package/swf-parser"><img src="https://img.shields.io/npm/v/swf-parser" alt="npm package"/></a>
<a href="https://github.com/open-flash/swf-parser/actions/workflows/check-ts.yml"><img src="https://img.shields.io/github/workflow/status/open-flash/swf-parser/check-ts/main"  alt="TypeScript checks status"/></a>

SWF parser implemented in Typescript, for Node and browsers.
Converts bytes to [`swf-types` movies][swf-types].

## Usage

```typescript
import fs from "fs";
import { Movie } from "swf-types";
import { parseSwf } from "swf-parser";

const bytes: Uint8Array = fs.readFileSync("movie.swf");
const movie: Movie = parseSwf(bytes);
```

## Contributing

This repo uses Git submodules for its test samples:

```sh
# Clone with submodules
git clone --recurse-submodules git://github.com/open-flash/swf-parser.git
# Update submodules for an already-cloned repo
git submodule update --init --recursive --remote
```

This library uses Gulp and npm for its builds, yarn is recommended for the
dependencies. **The commands must be run from the `ts` directory.**

```
cd ts
yarn install
# work your changes...
yarn test
```

Prefer non-`master` branches when sending a PR so your changes can be rebased if
needed. All the commits must be made on top of `master` (fast-forward merge).
CI must pass for changes to be accepted.

**[Documentation for the available Gulp tasks](https://github.com/demurgos/turbo-gulp/blob/master/docs/usage.md#main-tasks)**

[swf-types]: https://github.com/open-flash/swf-types
