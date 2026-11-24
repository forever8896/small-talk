#!/bin/sh
# Runs node/npm inside a container that can only see this folder.
cd "$(dirname "$0")" && exec docker run --rm -v "$PWD":/work -w /work --user "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm node:22-slim "$@"
