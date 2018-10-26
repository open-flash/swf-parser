#!/usr/bin/env bash
set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
set -x
cd "${PROJECT_ROOT}"
(cd swf-parser.rs && cargo build)
(cd swf-parser.ts && npm run prestart)
node test/test.js
