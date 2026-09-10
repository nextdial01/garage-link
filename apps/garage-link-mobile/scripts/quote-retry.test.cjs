// Runs actual App callbacks with synthetic hook state; no auth, device or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const names = [...source.matchAll(/const \[(\w+)(?:,\s*\w+)?\] = useState/g)].map(m => m[1]);
let state = {}, refs = [], index = 0, refIndex = 0, calls = [];
let outcome;
const react = { ...React, useState(initial) {
  const name = names[index++];
  if (!Object.hasOwn(state, name)) state[name] = typeof initial === 'function' ? initial() : initial;
  return [state[name], value => { state[name] = typeof value === 'function' ? value(state[name]) : value; }];
}, useRef(initial) { return refs[refIndex++] ?? (refs[refIndex - 1] = {current:initial}); }, useEffect() {}, useEffectEvent(fn) { return fn; }, useMemo(fn) { return fn(); } };
class ApiError extends Error {}
const api = { createQuote(...args) { calls.push(args); return outcome(); } };
const filename = path.join(root, 'App.quote-retry-test.cjs');
const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(root);
mod.require = id => {
  if (id === 'react') return react;
  if (id === 'react-native') return { StyleSheet:{create:v=>v}, Platform:{OS:'ios'}, useWindowDimensions:()=>({width:390}), ...Object.fromEntries(['ActivityIndicator','View','Text','ScrollView','FlatList','Image','TextInput','TouchableOpacity','KeyboardAvoidingView'].map(k=>[k,k])) };
  if (id === 'react-native-safe-area-context') return {SafeAreaProvider:'SafeAreaProvider',SafeAreaView:'SafeAreaView'};
  if (id === '@expo/vector-icons/Ionicons') return 'Icon';
  if (id === './src/mobileApi') return {mobileApi:api,MobileApiError:ApiError};
  if (id === './src/supabase') return {supabase:{},mobileConfigurationError:null};
  if (id.startsWith('expo-')) return {};
  if (id.startsWith('./src/')) return require(path.resolve(root,id+'.ts'));
  if (id.endsWith('.png')) return 1;
  return require(id);
};
mod._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
function render() { index=0; refIndex=0; return mod.exports.GarageMobileApp(); }
const settle = () => new Promise(resolve => setImmediate(resolve));
(async()=>{
  state={session:{user:{id:'synthetic-staff'}},authResolved:true,page:'quoteCreate',store:{id:'synthetic-store',role:'staff'},customer:{customer:{id:'synthetic-customer',name:'合成顧客'},vehicles:[]},itemName:'',itemPrice:'',quoteTitle:'保持する下書き',idempotencyKey:'synthetic-idempotency'};
  let screen=render();
  refs.find(ref=>ref.current===null).current=()=>{state.page='customerDetail';}; // previous customer read must not be retried
  screen.props.onRetry(); await settle();
  assert.equal(state.page,'quoteCreate'); assert.equal(calls.length,0);
  assert.match(state.error,/明細名/); assert.equal(state.quoteTitle,'保持する下書き');
  state.itemName='合成整備'; state.itemPrice='50000';
  outcome=()=>Promise.reject(new Error('Network request failed'));
  screen=render(); screen.props.onRetry(); await settle();
  assert.equal(state.page,'quoteCreate'); assert.equal(state.itemName,'合成整備'); assert.equal(state.itemPrice,'50000');
  assert.match(state.error,/接続/); assert.equal(calls.length,1);
  outcome=()=>Promise.resolve({id:'synthetic-quote',items:[]});
  screen=render(); screen.props.onRetry(); screen.props.onRetry(); await settle();
  assert.equal(calls.length,2,'duplicate retry while mutation pending must not send another request');
  assert.equal(state.page,'quotePreview'); assert.equal(state.quote.id,'synthetic-quote');
  assert.equal(calls[0][1],calls[1][1],'uncertain response retries retain the operation id');
  assert.deepEqual(calls[0][2],calls[1][2]);
  assert.equal(state.error,null);
  console.log('GARAGE_QUOTE_RETRY_VALIDATION_NETWORK_RECOVERY_DUPLICATE_GUARD=PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
