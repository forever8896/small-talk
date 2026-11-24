#!/bin/sh
# Serves the page at http://localhost:5180 from an isolated container (only this folder is visible to it).
cd "$(dirname "$0")" && exec docker run --rm --name small-talk-dev -p 127.0.0.1:5180:5180 -v "$PWD":/work -w /work --user "$(id -u):$(id -g)" -e HOME=/tmp node:22-slim npx vite
