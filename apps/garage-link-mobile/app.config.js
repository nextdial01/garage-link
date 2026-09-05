const app = require('./app.json');

const sourceSha = process.env.EAS_BUILD_GIT_COMMIT_HASH ?? process.env.BUILD_SOURCE_SHA ?? 'local-unresolved';

module.exports = () => ({
  ...app.expo,
  ios: {
    ...app.expo.ios,
    infoPlist: {
      ...app.expo.ios.infoPlist,
      QA_SOURCE_SHA: sourceSha,
      QA_APP_VERSION: app.expo.version,
    },
  },
  extra: {
    ...app.expo.extra,
    buildProvenance: {
      sourceSha,
      appVersion: app.expo.version,
      buildNumber: 'CFBundleVersion',
    },
  },
});
