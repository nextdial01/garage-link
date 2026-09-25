const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, imports = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, Blob, TextEncoder, Uint8Array,
    require(name) { assert.ok(imports[name], `Unexpected import ${name}`); return imports[name]; }, ...globals });
  return exports;
}
const expo = path.dirname(require.resolve('expo/package.json'));
const { convertFormDataAsync } = load(path.join(expo, 'src/winter/fetch/convertFormData.ts'), {
  '../../utils/blobUtils': { blobToArrayBufferAsync: (blob) => blob.arrayBuffer() },
});
const { installFormDataPatch } = load(path.join(expo, 'src/winter/FormData.ts'));
class NativeFormData { constructor() { this._parts = []; } }
installFormDataPatch(NativeFormData);
const image = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 42]);

test('installed Expo multipart converter rejects the former URI descriptor', async () => {
  const form = new NativeFormData();
  form.append('file', { uri: 'file:///synthetic.png', name: 'synthetic.png', type: 'image/png' });
  await assert.rejects(convertFormDataAsync(form), /Unsupported FormDataPart implementation/);
});

test('native photo helper produces a File accepted by the installed Expo converter', async () => {
  class NativeFile {
    constructor(uri) { assert.equal(uri, 'file:///synthetic.png'); this.name = 'cache-uuid.png'; this.type = 'application/octet-stream'; }
    async bytes() { return image; }
  }
  const { appendPhotoAsset } = load('src/photoUpload.native.ts', {
    'expo-file-system': { File: NativeFile },
  });
  const form = new NativeFormData();
  form.append('related_type', 'trade_in_vehicle');
  await appendPhotoAsset(form, { uri: 'file:///synthetic.png', fileName: 'synthetic.png', mimeType: 'image/png' });
  const { body } = await convertFormDataAsync(form, 'synthetic-boundary');
  assert.ok(Buffer.from(body).includes(Buffer.from(image)));
  assert.match(Buffer.from(body).toString(), /filename="synthetic.png"/);
  assert.match(Buffer.from(body).toString(), /content-type: image\/png/);
  assert.match(Buffer.from(body).toString(), /trade_in_vehicle/);
});

test('web photo helper preserves real file bytes and name without native imports', async () => {
  const { appendPhotoAsset } = load('src/photoUpload.ts', { 'react-native': { Platform: { OS: 'web' } } });
  const form = new FormData();
  await appendPhotoAsset(form, { uri: 'blob:synthetic', fileName: 'chosen.png', file: new File([image], 'original.png', { type: 'image/png' }) });
  assert.equal(form.get('file').name, 'chosen.png');
  assert.deepEqual(new Uint8Array(await form.get('file').arrayBuffer()), image);
});

test('web URI fallback obtains a Blob instead of appending a URI object', async () => {
  const { appendPhotoAsset } = load('src/photoUpload.ts', { 'react-native': { Platform: { OS: 'web' } } }, {
    fetch: async (uri) => { assert.equal(uri, 'blob:synthetic'); return new Response(image, { headers: { 'content-type': 'image/png' } }); },
  });
  const form = new FormData();
  await appendPhotoAsset(form, { uri: 'blob:synthetic', fileName: 'fallback.png' });
  assert.deepEqual(new Uint8Array(await form.get('file').arrayBuffer()), image);
});
