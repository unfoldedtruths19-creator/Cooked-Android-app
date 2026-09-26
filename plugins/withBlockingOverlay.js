/**
 * Expo config plugin — adds BlockingOverlayActivity to the AndroidManifest,
 * and disables Android Auto Backup for the app.
 * Runs during `expo prebuild` / `expo run:android`.
 *
 * WHY allowBackup=false: Android's default Auto Backup restores app files
 * (including the AsyncStorage DB that holds the cached Supabase session)
 * after a reinstall. That let a signed-out-looking reinstall silently come
 * back signed in, and it also restores an onboarding-complete flag and a
 * possibly-stale focus session pointer. AuthProvider's getUser() check
 * catches an outright-invalid token, but a still-valid token restored this
 * way would NOT be caught, so uninstall+reinstall would not actually
 * require signing in again as the spec requires.
 */
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Referenced by android:dataExtractionRules below. Excludes everything from
// both cloud backup and the Android 12+ device-to-device transfer path.
const DATA_EXTRACTION_RULES_XML = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup>
        <exclude domain="sharedpref" />
        <exclude domain="database" />
        <exclude domain="file" />
    </cloud-backup>
    <device-transfer>
        <exclude domain="sharedpref" />
        <exclude domain="database" />
        <exclude domain="file" />
    </device-transfer>
</data-extraction-rules>
`;

function withDataExtractionRulesFile(config) {
  return withDangerousMod(config, [
    'android',
    (config) => {
      const dir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'data_extraction_rules.xml'), DATA_EXTRACTION_RULES_XML);
      return config;
    },
  ]);
}

module.exports = function withBlockingOverlay(config) {
  config = withDataExtractionRulesFile(config);
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    // Avoid duplicates on re-runs
    const alreadyAdded = (app.activity || []).some(
      (a) => a.$['android:name'] === 'com.cooked.screentime.BlockingOverlayActivity'
    );

    if (!alreadyAdded) {
      if (!app.activity) app.activity = [];
      app.activity.push({
        $: {
          'android:name': 'com.cooked.screentime.BlockingOverlayActivity',
          'android:exported': 'false',
          'android:theme': '@android:style/Theme.Black.NoTitleBar.Fullscreen',
          'android:showOnLockScreen': 'true',
          'android:turnScreenOn': 'true',
          'android:excludeFromRecents': 'true',
          'android:launchMode': 'singleTask',
        },
      });
    }

    // Disable Auto Backup / cloud + device-transfer backup of app data,
    // so a reinstall can never come back with a restored auth session.
    app.$['android:allowBackup'] = 'false';
    app.$['android:fullBackupContent'] = 'false';
    // API 31+ device-to-device migration path — separate flag from allowBackup.
    app.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';

    return config;
  });
};
