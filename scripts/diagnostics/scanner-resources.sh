#!/usr/bin/env bash
set -euo pipefail
# Build the repository's exact antivirus runtime. Never deploy it.
docker build --target runtime --tag staging-scanner-probe . > /tmp/scanner-build.log 2>&1 || { tail -50 /tmp/scanner-build.log; exit 1; }
for limits in small large; do
  if [ "$limits" = small ]; then scan_memory=1g; scan_cpu=0.25; else scan_memory=3g; scan_cpu=1; fi
  scan_name="scanner-probe-$limits"
  docker create --name "$scan_name" --memory="$scan_memory" --cpus="$scan_cpu" --entrypoint sh staging-scanner-probe -c 'printf "Harmless isolated staging scanner test.\n" | clamscan --no-summary --stdout -' >/dev/null
  scan_start=$(date +%s)
  set +e
  timeout 180s docker start --attach "$scan_name"
  scan_exit=$?
  set -e
  echo "Scanner limit=$limits exit=$scan_exit elapsed=$(( $(date +%s)-scan_start ))s"
  docker inspect "$scan_name" --format 'OOMKilled={{.State.OOMKilled}} ExitCode={{.State.ExitCode}} Running={{.State.Running}}'
  docker rm -f "$scan_name" >/dev/null
 done
