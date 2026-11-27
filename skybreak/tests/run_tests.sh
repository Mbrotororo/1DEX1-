#!/usr/bin/env bash
# Runs the SKYBREAK test suite headless and checks the log.
#
# Usage (from the repository root, from skybreak/ or from anywhere):
#   skybreak/tests/run_tests.sh                 # all tests/test_*.gd
#   skybreak/tests/run_tests.sh --only=match    # only tests/test_match.gd
#
# Environment:
#   GODOT         path to the Godot 4.4.1 editor binary (default: godot / godot4 in PATH,
#                 then /opt/godot/Godot_v4.4.1-stable_linux.x86_64)
#   TEST_LOG      where to save the full log (default: skybreak/tests/logs/test_run.log)
#   TEST_TIMEOUT  seconds before the run is killed (default: 900)
#   FORCE_IMPORT  set to 1 to re-import the project even if the cache looks fresh
#   SKIP_IMPORT   set to 1 to never import (CI imports in its own step)
#
# Exit code is non-zero if the runner fails or crashes, if any line starts with FAIL,
# or if the log has any "SCRIPT ERROR" or engine "ERROR:" line (the runner itself
# prints PASS even when a test stops on a script error, so the log check matters).

set -u -o pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$TESTS_DIR/.." && pwd)"
TEST_LOG="${TEST_LOG:-$PROJECT_DIR/tests/logs/test_run.log}"
TEST_TIMEOUT="${TEST_TIMEOUT:-900}"

find_godot() {
	if [ -n "${GODOT:-}" ]; then
		echo "$GODOT"
		return
	fi
	local c
	for c in godot godot4; do
		if command -v "$c" > /dev/null 2>&1; then
			command -v "$c"
			return
		fi
	done
	if [ -x /opt/godot/Godot_v4.4.1-stable_linux.x86_64 ]; then
		echo /opt/godot/Godot_v4.4.1-stable_linux.x86_64
		return
	fi
	echo ""
}

# timeout is in GNU coreutils; run without a limit where it is missing.
with_timeout() {
	local secs="$1"
	shift
	if command -v timeout > /dev/null 2>&1; then
		timeout "$secs" "$@"
	else
		"$@"
	fi
}

GODOT_BIN="$(find_godot)"
if [ -z "$GODOT_BIN" ] || [ ! -x "$(command -v "$GODOT_BIN" 2> /dev/null || echo "$GODOT_BIN")" ]; then
	echo "run_tests: Godot binary not found. Set GODOT=/path/to/Godot_v4.4.1-stable_linux.x86_64" >&2
	exit 2
fi

GODOT_VERSION="$("$GODOT_BIN" --headless --version 2> /dev/null | tail -n 1)"
echo "run_tests: Godot $GODOT_VERSION ($GODOT_BIN)"
case "$GODOT_VERSION" in
	4.4.*) ;;
	*) echo "run_tests: warning: the project targets Godot 4.4.1" >&2 ;;
esac

# Import when the .godot cache is missing or older than the project files.
# Without it, class_name scripts and textures are not known to a fresh checkout.
STAMP="$PROJECT_DIR/.godot/run_tests_import.stamp"
need_import=0
if [ "${SKIP_IMPORT:-0}" = "1" ]; then
	need_import=0
elif [ "${FORCE_IMPORT:-0}" = "1" ] || [ ! -f "$STAMP" ] \
	|| [ ! -f "$PROJECT_DIR/.godot/global_script_class_cache.cfg" ] \
	|| [ ! -d "$PROJECT_DIR/.godot/imported" ]; then
	need_import=1
elif [ -n "$(find "$PROJECT_DIR" \( -path "$PROJECT_DIR/.godot" -o -path "$PROJECT_DIR/export" \) -prune -o \
	-type f \( -name '*.gd' -o -name '*.tscn' -o -name '*.tres' -o -name '*.gdshader' -o -name '*.import' \
	-o -name '*.uid' -o -name '*.webp' -o -name '*.png' -o -name '*.svg' -o -name 'project.godot' \) \
	-newer "$STAMP" -print -quit)" ]; then
	need_import=1
fi
mkdir -p "$(dirname "$TEST_LOG")"
IMPORT_LOG="$(dirname "$TEST_LOG")/import.log"
if [ "$need_import" = "1" ]; then
	echo "run_tests: importing project, log: $IMPORT_LOG"
	if ! with_timeout 600 "$GODOT_BIN" --headless --path "$PROJECT_DIR" --import > "$IMPORT_LOG" 2>&1; then
		tail -n 30 "$IMPORT_LOG"
		echo "run_tests: import failed" >&2
		exit 2
	fi
	touch "$STAMP"
fi

echo "run_tests: running tests, log: $TEST_LOG"
with_timeout "$TEST_TIMEOUT" "$GODOT_BIN" --headless --path "$PROJECT_DIR" res://tests/test_runner.tscn -- "$@" 2>&1 | tee "$TEST_LOG"
rc=${PIPESTATUS[0]}

problems=()
if [ "$rc" = "124" ]; then
	problems+=("timed out after ${TEST_TIMEOUT} s")
elif [ "$rc" != "0" ]; then
	problems+=("runner exit code $rc")
fi
fails="$(grep -c '^FAIL' "$TEST_LOG")"
script_errors="$(grep -c 'SCRIPT ERROR' "$TEST_LOG")"
engine_errors="$(grep -E '^(USER )?ERROR:' "$TEST_LOG" | grep -vc 'SCRIPT ERROR')"
passes="$(grep -c '^PASS' "$TEST_LOG")"
[ "$fails" != "0" ] && problems+=("$fails FAIL line(s)")
[ "$script_errors" != "0" ] && problems+=("$script_errors SCRIPT ERROR line(s)")
[ "$engine_errors" != "0" ] && problems+=("$engine_errors ERROR: line(s)")
if ! grep -q 'ИТОГО:' "$TEST_LOG"; then
	problems+=("no summary line, the runner did not finish")
fi
if [ "$passes" = "0" ]; then
	problems+=("no PASS lines")
fi

echo "------------------------------------------------------------"
if [ "${#problems[@]}" -gt 0 ]; then
	joined="$(printf '%s; ' "${problems[@]}")"
	echo "run_tests: FAILED (${passes} passed): ${joined%; }"
	grep -nE '^FAIL|^   - |SCRIPT ERROR|^(USER )?ERROR:' "$TEST_LOG" | head -n 60
	exit 1
fi
echo "run_tests: OK, ${passes} test file(s) passed, no script errors"
exit 0
