import assert from 'node:assert/strict';
import test from 'node:test';
import { humanDocumentMemo, mergeDocumentMemo } from '../../src/lib/business/documentMemo.ts';

test('shows human prose without valid payment and trade-in JSON lines', () => {
  const raw = [
    '納車前にお客様へ連絡する',
    '支払方法内訳: [{"id":"p1","amount":1000}]',
    '下取り情報: {"maker":"A","model":"B"}',
  ].join('\n');

  assert.equal(humanDocumentMemo(raw), '納車前にお客様へ連絡する');
});

test('preserves malformed labels and ordinary memo lines as human text', () => {
  const raw = [
    '社内確認をお願いします',
    '支払方法内訳: JSONの形式を確認する',
    '下取り情報: 後日確認',
  ].join('\n');

  assert.equal(humanDocumentMemo(raw), raw);
});

test('merges edited human prose with the original structured entries unchanged', () => {
  const paymentLine = '支払方法内訳: [{"id":"p1","amount":1000}]';
  const tradeInLine = '下取り情報: {"maker":"A","model":"B"}';
  const source = ['元のメモ', paymentLine, tradeInLine].join('\n');

  assert.equal(mergeDocumentMemo('  保存前に連絡  ', source), `保存前に連絡\n${paymentLine}\n${tradeInLine}`);
  assert.equal(mergeDocumentMemo('', source), `${paymentLine}\n${tradeInLine}`);
  assert.equal(mergeDocumentMemo('新規メモ', null), '新規メモ');
  assert.equal(mergeDocumentMemo('', null), null);
});
