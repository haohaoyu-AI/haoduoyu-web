#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export HOME="$ROOT/.dotnet-home" DOTNET_CLI_HOME="$ROOT/.dotnet-home"
export XDG_RUNTIME_DIR="$ROOT/.dotnet-home/runtime" XDG_DATA_HOME="$ROOT/.dotnet-home/data" XDG_CACHE_HOME="$ROOT/.dotnet-home/cache"
export NUGET_PACKAGES="$ROOT/.nuget" NUGET_HTTP_CACHE_PATH="$ROOT/.nuget-http"
export DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_GENERATE_ASPNET_CERTIFICATE=false
mkdir -p "$XDG_RUNTIME_DIR" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"
exec "${DOTNET_BIN:-/workspace/scratch/e49e34e074a9/desktop-native-resume/sdk/dotnet}" "$@"
