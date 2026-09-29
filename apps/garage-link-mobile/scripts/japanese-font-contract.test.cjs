const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');

assert.match(app, /ios:\s*'Hiragino Sans'/, 'iOS must explicitly select a Japanese system font');
assert.match(app, /android:\s*'NotoSansJP'/, 'Android must select the bundled Japanese family');
assert.match(app, /function Text\([\s\S]*?styles\.jpText/, 'App text must pass through the Japanese font wrapper');
assert.match(app, /input:[\s\S]*?fontFamily:\s*japaneseSystemFont/, 'Text inputs must select the Japanese system font');
assert.match(app, /searchInput:[\s\S]*?fontFamily:\s*japaneseSystemFont/, 'Search inputs must select the Japanese system font');

console.log('japanese-font-contract: PASS');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
const fontPlugin = config.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-font');
const family = fontPlugin?.[1]?.android?.fonts?.find(font => font.fontFamily === 'NotoSansJP');
assert.ok(family?.fontDefinitions?.length, 'Android family must actually be bundled');
for (const font of family.fontDefinitions) assert.ok(fs.existsSync(path.resolve(__dirname, '..', font.path)), 'configured Japanese font asset must exist');
