#!/usr/bin/env bash

# Temporarily duplicate pre-deploy output so a fast Railway failure has a
# second, explicit emission point after the test process terminates.
set -o pipefail

log_file="/tmp/nexteam-predeploy.log"
printf '%s\n' 'NEXTEAM_PREDEPLOY_DIAGNOSTIC_START'
NEXTEAM_DEFAULT_TEST_TIMEOUT_MS=60000 NEXTEAM_TEST_FILE_SLICE=first npm test 2>&1 | tee "$log_file"
test_status=${PIPESTATUS[0]}
printf '%s\n' 'NEXTEAM_PREDEPLOY_DIAGNOSTIC_REPLAY_START'
cat "$log_file"
printf '%s=%s\n' 'NEXTEAM_PREDEPLOY_DIAGNOSTIC_EXIT_CODE' "$test_status"
exit "$test_status"
