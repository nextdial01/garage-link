const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Keep provenance in the native configuration evaluated by Expo itself.  A
// post-install mutation of app.json is too late for some local EAS workflows.
const staticConfig = require('./app.json');
const app = staticConfig.expo;
const sourceSha = process.env.EAS_BUILD_GIT_COMMIT_HASH || process.env.GIT_COMMIT_HASH || 'development';
const appIcon = path.join(__dirname, 'assets', 'app-icon-ios.png');
const appIconSha256 = crypto.createHash('sha256').update(fs.readFileSync(appIcon)).digest('hex');
const apiBaseUrl = process.env.EXPO_PUBLIC_APP_BASE_URL || '';
const routeManifest = ['/login', '/stores', '/today', '/vehicles', '/maintenance', '/customers', '/quotes'];

module.exports = {
  ...app,
  ios: {
    ...app.ios,
    infoPlist: {
      ...app.ios?.infoPlist,
      QA_SOURCE_SHA: sourceSha,
      QA_APP_VERSION: app.version,
      QA_APP_ICON_SHA256: appIconSha256,
      QA_API_BASE_URL: apiBaseUrl,
      QA_ROUTE_MANIFEST: routeManifest.join(','),
    },
  },
  extra: {
    ...app.extra,
    buildProvenance: {
      sourceSha,
      appVersion: app.version,
      appIconSha256,
      apiBaseUrl,
      routeManifest,
    },
  },
};
