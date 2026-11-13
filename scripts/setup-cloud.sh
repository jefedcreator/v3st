#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

required_node="$(tr -d '\r\n' < .nvmrc)"
actual_node="$(node --version)"
if [[ "$actual_node" != "v$required_node" ]]; then
  printf 'Use Node.js %s from .nvmrc; found %s.\n' "$required_node" "$actual_node" >&2
  exit 1
fi

actual_yarn="$(yarn --version)"
if [[ "$actual_yarn" != "1.22.22" ]]; then
  printf 'Use Yarn 1.22.22; found %s.\n' "$actual_yarn" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  printf 'Created local .env from the non-secret beta template.\n'
fi

yarn install --frozen-lockfile --non-interactive
printf 'Dependencies and the platform-specific Prisma client are ready.\n'
printf 'Read AGENTS.md and the implementation plan before starting Task 1.\n'
