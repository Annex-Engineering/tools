#!/usr/bin/bash

set -eo pipefail

SELFDIR="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$SELFDIR"

rm -rf dist/
mkdir -p dist/

(cd beacon_plotter && bun install --dev && bun run build --base "/beacon_plotter" --outDir "$SELFDIR/dist/beacon_plotter")
(cd _frontpage && bun install --dev && bun run build --base "/" --outDir "$SELFDIR/dist")
