const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const sourceSha = process.env.EAS_BUILD_GIT_COMMIT_HASH;
if (!sourceSha || !/^[0-9a-f]{40}$/i.test(sourceSha)) {
  throw new Error('EAS_BUILD_GIT_COMMIT_HASH is required to embed build provenance.');
}

const configPath = process.env.APP_CONFIG_PATH || path.join(__dirname, '..', 'app.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const app = config.expo;
const appIconPath = path.join(path.dirname(configPath), 'assets', 'app-icon-ios.png');
const appIconSha256 = crypto.createHash('sha256').update(fs.readFileSync(appIconPath)).digest('hex');
const apiBaseUrl = process.env.EXPO_PUBLIC_APP_BASE_URL ?? '';
const routeManifest = ['/login', '/stores', '/today', '/vehicles', '/maintenance', '/customers', '/quotes'];
app.ios.infoPlist = {
  ...app.ios.infoPlist,
  QA_SOURCE_SHA: sourceSha,
  QA_APP_VERSION: app.version,
  QA_APP_ICON_SHA256: appIconSha256,
  QA_API_BASE_URL: apiBaseUrl,
  QA_ROUTE_MANIFEST: routeManifest.join(','),
};
app.extra.buildProvenance = {
  sourceSha,
  appVersion: app.version,
  buildNumber: 'CFBundleVersion',
  appIconSha256,
  apiBaseUrl,
  routeManifest,
};
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
