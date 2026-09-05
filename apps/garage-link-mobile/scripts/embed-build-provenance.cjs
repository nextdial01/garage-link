const fs = require('node:fs');
const path = require('node:path');

const sourceSha = process.env.EAS_BUILD_GIT_COMMIT_HASH;
if (!sourceSha || !/^[0-9a-f]{40}$/i.test(sourceSha)) {
  throw new Error('EAS_BUILD_GIT_COMMIT_HASH is required to embed build provenance.');
}

const configPath = process.env.APP_CONFIG_PATH || path.join(__dirname, '..', 'app.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const app = config.expo;
app.ios.infoPlist = {
  ...app.ios.infoPlist,
  QA_SOURCE_SHA: sourceSha,
  QA_APP_VERSION: app.version,
};
app.extra.buildProvenance = {
  sourceSha,
  appVersion: app.version,
  buildNumber: 'CFBundleVersion',
};
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
