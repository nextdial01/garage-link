const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const sourcePath = `${process.cwd()}/src/v2/dealLabels.ts`;
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', compiled)(loaded, loaded.exports);
const { dealCustomerLabel, dealVehicleLabel, dealRelatedDisplayLabel } = loaded.exports;

assert.equal(dealCustomerLabel({ name: '山田 太郎' }), '山田 太郎');
assert.equal(dealCustomerLabel({ name: '123e4567-e89b-42d3-a456-426614174000' }), '');
assert.equal(dealCustomerLabel({ name: '顧客 123e4567-e89b-42d3-a456-426614174000' }), '');
assert.equal(dealVehicleLabel({ maker: 'ホンダ', model_name: 'N-BOX', id: '123e4567-e89b-42d3-a456-426614174000' }), 'ホンダ N-BOX');
assert.equal(dealVehicleLabel({ maker: '123e4567-e89b-42d3-a456-426614174000', modelName: '123e4567-e89b-42d3-a456-426614174000' }), '');
assert.equal(dealVehicleLabel({ maker: 'スズキ', modelName: '車 123e4567-e89b-42d3-a456-426614174000' }), 'スズキ');
assert.equal(dealVehicleLabel({ managementNo: 'GL-001' }), 'GL-001');
assert.equal(dealCustomerLabel(null), '');
assert.equal(dealVehicleLabel(undefined), '');
assert.equal(dealRelatedDisplayLabel('123e4567-e89b-42d3-a456-426614174000', '山田 太郎'), '山田 太郎');
assert.equal(dealRelatedDisplayLabel('123e4567-e89b-42d3-a456-426614174000', 'ホンダ N-BOX'), 'ホンダ N-BOX');
assert.equal(dealRelatedDisplayLabel('123e4567-e89b-42d3-a456-426614174000', '読み込み中…'), '読み込み中…');
assert.equal(dealRelatedDisplayLabel('123e4567-e89b-42d3-a456-426614174000', ''), '関連情報を取得できません');
assert.equal(dealRelatedDisplayLabel('123e4567-e89b-42d3-a456-426614174000', '顧客 123e4567-e89b-42d3-a456-426614174000'), '関連情報を取得できません');
assert.equal(dealRelatedDisplayLabel('', 'どの値でも'), '未設定');

const contentSource = fs.readFileSync(`${process.cwd()}/src/v2/Content.tsx`, 'utf8');
assert.match(contentSource, /dealRelatedDisplayLabel\(str\(row,'customer_id'\)/);
assert.match(contentSource, /dealRelatedDisplayLabel\(str\(row,'vehicle_id'\)/);
assert.doesNotMatch(contentSource, /label="顧客" value=\{[^}]*customer_id/);
assert.doesNotMatch(contentSource, /label="車両" value=\{[^}]*vehicle_id/);

console.log('GARAGE_DEAL_RELATED_LABELS=PASS');
