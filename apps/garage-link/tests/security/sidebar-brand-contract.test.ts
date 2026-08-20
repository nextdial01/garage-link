import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

type PngBounds = { left: number; top: number; right: number; bottom: number; whiteOpaquePixels: number };

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  return leftDistance <= upDistance && leftDistance <= upLeftDistance ? left : upDistance <= upLeftDistance ? up : upLeft;
}

function pngAlphaBounds(source: Buffer): PngBounds {
  const signature = '89504e470d0a1a0a';
  expect(source.subarray(0, 8).toString('hex')).toBe(signature);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset < source.length) {
    const length = source.readUInt32BE(offset);
    const type = source.subarray(offset + 4, offset + 8).toString('ascii');
    const data = source.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8);
      expect(data[9]).toBe(6);
    }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') break;
    offset += length + 12;
  }
  const bytesPerPixel = 4;
  const rowBytes = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idat));
  let cursor = 0;
  let previous = Buffer.alloc(rowBytes);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let whiteOpaquePixels = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[cursor++];
    const current = Buffer.from(inflated.subarray(cursor, cursor + rowBytes));
    cursor += rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const prior = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      if (filter === 1) current[x] = (current[x] + prior) & 0xff;
      if (filter === 2) current[x] = (current[x] + up) & 0xff;
      if (filter === 3) current[x] = (current[x] + Math.floor((prior + up) / 2)) & 0xff;
      if (filter === 4) current[x] = (current[x] + paeth(prior, up, upLeft)) & 0xff;
    }
    expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < width; x += 1) {
      const pixel = x * bytesPerPixel;
      const alpha = current[pixel + 3];
      if (alpha === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      if (alpha === 255 && current[pixel] > 245 && current[pixel + 1] > 245 && current[pixel + 2] > 245) whiteOpaquePixels += 1;
    }
    previous = current;
  }
  return { left, top, right, bottom, whiteOpaquePixels };
}

test.describe('サイドバーブランドの再発防止契約', () => {
  test('canonical logoは透明余白と白背景を含まない', async () => {
    const source = await readFile('public/branding/garage-link-logo.png');
    const bounds = pngAlphaBounds(source);
    expect(bounds).toEqual({ left: 0, top: 0, right: 1009, bottom: 395, whiteOpaquePixels: 0 });
  });

  test('BrandLogoは画像自身の比率で表示し、sidebarは単一列カードを使う', async () => {
    const [logo, sidebar] = await Promise.all([
      readFile('src/components/BrandLogo.tsx', 'utf8'),
      readFile('src/components/AppSidebar.tsx', 'utf8'),
    ]);
    expect(logo).toContain('width={1010}');
    expect(logo).toContain('height={396}');
    expect(logo).toContain('!w-auto');
    expect(logo).not.toContain('fill');
    expect(logo).not.toContain('object-contain');
    expect(sidebar).toContain('data-testid="sidebar-brand-card"');
    expect(sidebar).toContain('flex w-full min-w-0 flex-col items-start');
    expect(sidebar).toContain('break-words text-sm font-black');
    expect(sidebar).not.toContain('権限:');
    expect(sidebar).not.toContain('truncate text-sm font-black text-slate-900');
  });
});
