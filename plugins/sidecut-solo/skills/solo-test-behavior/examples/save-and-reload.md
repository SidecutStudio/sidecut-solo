# Test saving a preference

**Request** “Confirm that changing the notification setting works after a refresh.”

**Setup** Use an isolated preview with a fixture account whose notifications start enabled. Record the build and route.

**Actions** Open settings, turn notifications off, save, reload and open settings again. Repeat with the save request forced to fail in the fixture. Restore the connection and retry.

**Illustrative result** Pass for persistence when the setting remains off after reload. In the simulated failure, verify that the interface reports the failed save, keeps the last saved value after reload and allows a successful retry. Report simulated dependency behavior separately from any live integration check.
