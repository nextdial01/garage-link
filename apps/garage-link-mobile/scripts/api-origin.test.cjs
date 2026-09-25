const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('src/apiOrigin.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
for(const dev of [true,false,undefined]){const exports={};vm.runInNewContext(code,{exports,URL,...(dev===undefined?{}:{__DEV__:dev})});const valid=exports.validMobileApiOrigin;
assert.equal(valid('https://app.example.invalid'),true);
for(const host of ['127.0.0.1','localhost','[::1]'])assert.equal(valid(`http://${host}:3001`),dev===true);
for(const origin of [undefined,'http://app.example.invalid','http://127.0.0.1:3002','http://127.0.0.1:3001/path','http://user:pw@127.0.0.1:3001','http://127.0.0.1:3001?secret=x','http://127.0.0.1:3001#x','http://127.0.0.1.evil.test:3001'])assert.equal(valid(origin),false);
}console.log('MOBILE_API_ORIGIN_BOUNDARY=PASS');
