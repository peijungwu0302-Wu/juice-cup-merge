import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const asset = (path) => new URL(path, root);
const spec = JSON.parse(readFileSync(asset('app/game/v51-asset-spec.json'), 'utf8'));

function assertGlb(path, maximumBytes) {
  const contents = readFileSync(path);
  assert.equal(contents.subarray(0, 4).toString('ascii'), 'glTF');
  assert.equal(contents.readUInt32LE(4), 2);
  assert.equal(contents.readUInt32LE(8), contents.length);
  assert.ok(contents.length < maximumBytes, `${path.pathname} exceeds ${maximumBytes} bytes`);
  return contents.length;
}

test('V5.1 ships valid, mobile-budgeted Meshopt GLBs', () => {
  const cups = assertGlb(asset('public/models/cups-v51.glb'), 3_500_000);
  const lane = assertGlb(asset('public/models/lane-v51.glb'), 750_000);
  assert.ok(cups + lane < 3_600_000);
  assert.equal(spec.version, '5.1.0');
});

test('all 21 HUD renders are independent RGBA images with safe fixed canvases', () => {
  let total = 0;
  for (const kind of ['juice', 'sundae', 'wine']) {
    for (let level = 1; level <= 7; level += 1) {
      const path = asset(`public/icons/v51/${kind}-${level}.png`);
      const contents = readFileSync(path);
      assert.deepEqual([...contents.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(contents.readUInt32BE(16), 180);
      assert.equal(contents.readUInt32BE(20), 230);
      assert.equal(contents[25], 6, `${kind}-${level} must be RGBA`);
      total += statSync(path).size;
    }
  }
  assert.ok(total < 1_300_000, `HUD icons total ${total} bytes`);
});

test('the shared spec aligns every visible rail and wall center with physics', () => {
  assert.equal(spec.lane.railCenterX, spec.lane.width / 2 + spec.lane.railWidth / 2);
  assert.equal(spec.lane.frontWallCenterZ, -spec.lane.length / 2 - spec.lane.frontWallDepth / 2 - 0.01);
  assert.equal(spec.cup.colliderSlices.length, 5);
  assert.equal(spec.cup.colliderSlices.at(-1).radius, spec.cup.modelRadius);
});
