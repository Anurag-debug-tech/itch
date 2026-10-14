#!/bin/sh
set -eu
TASK_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export RUSTUP_HOME="$TASK_ROOT/.tools/rustup"
export CARGO_HOME="$TASK_ROOT/.tools/cargo"
export PATH="$TASK_ROOT/.tools/bin:$CARGO_HOME/bin:$PATH"
export CARGO_INCREMENTAL=0
cd "$TASK_ROOT/contracts"
exec cargo "$@"
