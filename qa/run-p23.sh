#!/usr/bin/env bash
# Phase 2-3 verification in one chain: serve the existing build, capture every
# chapter at the sizes in the contract, then run the stage and resilience tests.
export PATH="/usr/bin:/bin:/mingw64/bin:/c/Program Files/nodejs:$PATH"
cd /c/Users/Administrator/sunny-prism || exit 1

npx next start -p 3000 > /server-run.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT

for i in $(seq 1 60); do
  grep -qa "Ready in" /server-run.log && break
  sleep 2
done
grep -qa "Ready in" /server-run.log || { echo "SERVER FAILED"; tail -20 /server-run.log; exit 1; }
echo "=== server ready ==="

STOPS_FULL="0,0.16,0.3,0.43,0.5,0.6,0.68,0.75,0.82,0.9,0.96,1"
STOPS_SHORT="0,0.3,0.6,0.75,0.9,1"

echo "=== captures: 1440x900 ==="
node qa/hero.mjs http://localhost:3000 c2-desktop 1440 900 "$STOPS_FULL" 2>&1 | tail -16
echo "=== captures: 1920x1080 ==="
node qa/hero.mjs http://localhost:3000 c2-wide 1920 1080 "$STOPS_SHORT" 2>&1 | tail -9
echo "=== captures: 390x844 ==="
node qa/hero.mjs http://localhost:3000 c2-mobile 390 844 "$STOPS_FULL" 2>&1 | tail -16
echo "=== captures: 768x1024 ==="
node qa/hero.mjs http://localhost:3000 c2-tablet 768 1024 "$STOPS_SHORT" 2>&1 | tail -9

echo "=== bands test: 1440x900 ==="
node qa/bands-test.mjs http://localhost:3000 1440 900 2>&1 | tail -40
echo "=== bands test: 390x844 ==="
node qa/bands-test.mjs http://localhost:3000 390 844 2>&1 | tail -40

echo "=== scrub test ==="
node qa/scrub-test.mjs http://localhost:3000 2>&1 | tail -25
echo "=== texture failure test ==="
node qa/texture-failure-test.mjs http://localhost:3000 2>&1 | tail -12
echo "=== a11y / fallback test ==="
node qa/a11y-fallback-test.mjs http://localhost:3000 2>&1 | tail -20

echo "=== ALL RUNS COMPLETE ==="
