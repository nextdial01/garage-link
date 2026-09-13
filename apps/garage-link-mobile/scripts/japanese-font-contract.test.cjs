const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');

assert.match(app, /ios:\s*'Hiragino Sans'/, 'iOS must explicitly select a Japanese system font');
assert.match(app, /android:\s*'sans-serif'/, 'Android must explicitly select the native system sans family');
assert.match(app, /function Text\([\s\S]*?styles\.jpText/, 'App text must pass through the Japanese font wrapper');
assert.match(app, /input:[\s\S]*?fontFamily:\s*japaneseSystemFont/, 'Text inputs must select the Japanese system font');
assert.match(app, /searchInput:[\s\S]*?fontFamily:\s*japaneseSystemFont/, 'Search inputs must select the Japanese system font');

console.log('japanese-font-contract: PASS');
