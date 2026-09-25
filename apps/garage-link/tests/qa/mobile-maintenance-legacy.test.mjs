import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(import.meta.dirname, '../../src');
const cache = new Map();
function load(file) {
 if(cache.has(file)) return cache.get(file).exports;
 const loaded={exports:{}};cache.set(file,loaded);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const localRequire=id=>load((id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(file),id))+'.ts');
 new Function('require','module','exports',code)(localRequire,loaded,loaded.exports);return loaded.exports;
}
const {maintenanceBusinessPatch}=load(path.join(root,'lib/mobile/businessPatch.ts'));
const legacy={work_details:[],work_details_version:0,work_items:['Oil, filter'],labor_amount:1500,parts_amount:500,tax_display_mode:null};
test('legacy mobile memo-only edit preserves existing labor and comma work label',()=>{
 const result=maintenanceBusinessPatch({...legacy,work_memo:'updated'},'included',false);
 assert.equal(result.labor_amount,1500);assert.equal(result.estimated_total_amount,2000);
 assert.equal(result.work_details[0].description,'Oil, filter');assert.equal(result.work_details_version,1);
});
test('explicit replacement including intentional empty rows is honored',()=>{
 const result=maintenanceBusinessPatch({...legacy,work_details:[]},'included',true);
 assert.equal(result.labor_amount,0);assert.equal(result.estimated_total_amount,500);
});
test('new mobile work and saved version one retain fractional row amounts',()=>{
 const row={description:'Work',category:'',unit:'h',note:'',quantity:1.5,unit_price:1000,tax_rate:0.1,tax_category:'taxable'};
 assert.equal(maintenanceBusinessPatch({work_details:[row]},'included').labor_amount,1500);
 assert.equal(maintenanceBusinessPatch({work_details:[row],work_details_version:1},'included',false).labor_amount,1500);
});
test('mobile editing retains actual zero/eight-percent parts rather than taxing their aggregate at ten percent',()=>{
 const {maintenancePartLines}=load(path.join(root,'lib/mobile/businessPatch.ts'));
 const lines=maintenancePartLines([{subtotal_amount:1000,tax_rate:0.08},{subtotal_amount:100,tax_rate:0}]);
 const result=maintenanceBusinessPatch({work_details:[],work_details_version:1,parts_amount:9999,tax_display_mode:'excluded'},'included',false,lines);
 assert.equal(result.estimated_total_amount,1180);
 assert.equal(result.parts_amount,1100);
 const included=maintenanceBusinessPatch({work_details:[],work_details_version:1,parts_amount:1180,tax_display_mode:'included'},'excluded',false,maintenancePartLines([{subtotal_amount:1080,tax_rate:0.08},{subtotal_amount:100,tax_rate:0}]));
 assert.equal(included.estimated_total_amount,1180);
 assert.equal(included.parts_amount,1180);
});
