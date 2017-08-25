#!/usr/bin/env bash
set -e
cd ../swf-parser.rs && cargo build
cd ../test && RUST_BACKTRACE=1 python3 ./test.py
