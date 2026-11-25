# Test saving a preference

**Request** “Confirm that changing the notification setting works after a refresh.”

**Setup** Use an isolated preview with a fixture account whose notifications start enabled. Record the build and route.

**Actions** Open settings, turn notifications off, save, reload and open settings again. Force the next save to fail in the fixture, then try turning notifications back on. Reload, restore the connection and retry turning them on.

**Illustrative result** Pass for persistence when the setting remains off after reload. In the simulated failure, verify that the interface reports the failed save, keeps notifications off after reload and saves the new enabled value after retry. Reload again to check that notifications stay on. Report simulated dependency behavior separately from any live integration check.
