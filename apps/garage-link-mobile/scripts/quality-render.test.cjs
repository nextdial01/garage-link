const assert = require('node:assert/strict');
const { render } = require('./quality-preview.cjs');
const pages=['login','stores','today','vehicles','vehicleDetail','maintenance','maintenanceDetail','customers','customerDetail','quotes','quoteCreate','quotePreview'];
let count=0;
for(const page of pages)for(const width of [320,390,820])for(const state of ['', '&error=1','&empty=1','&loading=1']) {
 const html=render(new URL(`http://127.0.0.1/?screen=${page}&width=${width}${state}`));
 assert.ok(html.includes('class="phone"'));assert.ok(!html.includes('undefined'));
 if(state==='&error=1')assert.ok(html.includes('通信に時間がかかっています。'));
 if(page==='vehicleDetail') { assert.ok(html.includes('DEMO-001'),'read error keeps detail content'); assert.ok(html.includes('aria-selected="true"'),'detail preserves parent tab'); }
 if(page==='quoteCreate') { assert.ok(html.includes('車両を指定しない'));assert.ok(html.includes('aria-checked="true"')); }
 if(page==='quotePreview') { assert.ok(html.includes('小計'));assert.ok(html.includes('消費税')); }
 count++;
}
for (const page of ['customers','vehicles']) {
 const empty=render(new URL(`http://127.0.0.1/?screen=${page}&empty=1`));
 const searched=render(new URL(`http://127.0.0.1/?screen=${page}&empty=1&search=sample`));
 assert.ok(empty.includes('Web版で') && empty.includes('登録すると'), 'initial empty explains registration');
 assert.ok(!empty.includes('検索条件を解除してください。'), 'initial empty does not suggest clearing absent query');
 assert.ok(searched.includes('検索条件を解除してください。'), 'search empty explains clearing query');
}
for (const page of ['customers','vehicles','maintenance','quotes']) {
 assert.ok(render(new URL(`http://127.0.0.1/?screen=${page}&more=1`)).includes('さらに読み込む'));
 assert.ok(!render(new URL(`http://127.0.0.1/?screen=${page}`)).includes('さらに読み込む'));
}
console.log(`GARAGE_SYNTHETIC_RENDER_${count}_CASES=PASS`);
