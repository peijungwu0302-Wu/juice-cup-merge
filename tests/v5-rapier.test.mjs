import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';

await RAPIER.init({});

const HALF_WIDTH = 2.8;
const HALF_LENGTH = 9.8;
const RADIUS = 0.46;
const HEIGHT = 1.357;

function collider(desc, restitution, friction = 0.18) {
  return desc
    .setRestitution(restitution)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
    .setFriction(friction);
}

function buildWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: -0.0981 });
  world.timestep = 1 / 60;
  world.maxCcdSubsteps = 2;
  world.numSolverIterations = 8;
  world.createCollider(collider(RAPIER.ColliderDesc.cuboid(HALF_WIDTH, 0.12, HALF_LENGTH).setTranslation(0, -0.12, 0), 0));
  world.createCollider(collider(RAPIER.ColliderDesc.cuboid(0.18, 0.36, HALF_LENGTH + 0.15).setTranslation(-2.98, 0.25, 0), 0.91));
  world.createCollider(collider(RAPIER.ColliderDesc.cuboid(0.18, 0.36, HALF_LENGTH + 0.15).setTranslation(2.98, 0.25, 0), 0.91));
  world.createCollider(collider(RAPIER.ColliderDesc.cuboid(3.15, 0.76, 0.17).setTranslation(0, 0.64, -9.98), 0.12));
  world.createCollider(collider(RAPIER.ColliderDesc.cuboid(3.15, 0.3, 0.18).setTranslation(0, 0.1, 9.98), 0.04));
  return world;
}

function addCup(world, x, z, velocity = { x: 0, y: 0, z: 0 }) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, 0.03, z)
    .setLinvel(velocity.x, velocity.y, velocity.z)
    .setLinearDamping(0.36)
    .setAngularDamping(2.4)
    .setCcdEnabled(true));
  body.setEnabledRotations(false, true, false, true);
  world.createCollider(collider(RAPIER.ColliderDesc.cylinder(HEIGHT * 0.065, RADIUS * 0.52)
    .setTranslation(0, HEIGHT * 0.065, 0), 0.22, 0.12), body);
  world.createCollider(collider(RAPIER.ColliderDesc.cylinder(HEIGHT * 0.16, RADIUS * 0.73)
    .setTranslation(0, HEIGHT * 0.34, 0), 0.22, 0.12), body);
  world.createCollider(collider(RAPIER.ColliderDesc.cylinder(HEIGHT * 0.245, RADIUS * 0.985)
    .setTranslation(0, HEIGHT * 0.69, 0), 0.22, 0.12), body);
  return body;
}

test('continuous collision detection keeps a fast throw between the physical rails', () => {
  const world = buildWorld();
  const cup = addCup(world, 0, 8.4, { x: 18, y: 0, z: -16 });
  let reflected = false;
  for (let step = 0; step < 240; step += 1) {
    world.step();
    if (cup.linvel().x < -0.3) reflected = true;
    assert.ok(Math.abs(cup.translation().x) <= HALF_WIDTH - RADIUS * 0.45 + 0.04);
    assert.ok(Number.isFinite(cup.translation().z));
  }
  assert.ok(reflected, 'the cup should hit and reflect from a side rail');
  world.free();
});

test('compound cup colliders separate an overlapped pair and settle without tunnelling', () => {
  const world = buildWorld();
  const first = addCup(world, -0.32, -8.45);
  const second = addCup(world, 0.32, -8.45);
  for (let step = 0; step < 720; step += 1) world.step();
  const separation = Math.hypot(first.translation().x - second.translation().x, first.translation().z - second.translation().z);
  assert.ok(separation >= RADIUS * 1.85, `separation was ${separation}`);
  assert.ok(Math.hypot(first.linvel().x, first.linvel().z) < 0.2);
  assert.ok(Math.hypot(second.linvel().x, second.linvel().z) < 0.2);
  world.free();
});

test('upright-only rotation prevents tall art from tipping into neighboring cups', () => {
  const world = buildWorld();
  const cup = addCup(world, 0, 3, { x: 4, y: 0, z: -6 });
  cup.applyTorqueImpulse({ x: 80, y: 5, z: 80 }, true);
  for (let step = 0; step < 180; step += 1) world.step();
  const rotation = cup.rotation();
  assert.ok(Math.abs(rotation.x) < 1e-4);
  assert.ok(Math.abs(rotation.z) < 1e-4);
  world.free();
});

test('a crowded lane remains finite, bounded, and settles instead of collectively jittering', () => {
  const world = buildWorld();
  const cups = [];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      cups.push(addCup(world, -1.8 + column * 0.9, -8.55 + row * 0.82, {
        x: (column - 2) * 0.025,
        y: 0,
        z: -0.04 * row,
      }));
    }
  }
  for (let step = 0; step < 1200; step += 1) world.step();
  let combinedPlanarSpeed = 0;
  for (const cup of cups) {
    const position = cup.translation();
    const velocity = cup.linvel();
    assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z));
    assert.ok(Math.abs(position.x) < HALF_WIDTH);
    assert.ok(position.z > -HALF_LENGTH - 0.4 && position.z < HALF_LENGTH + 0.4);
    combinedPlanarSpeed += Math.hypot(velocity.x, velocity.z);
  }
  assert.ok(combinedPlanarSpeed / cups.length < 0.15, `mean residual speed was ${combinedPlanarSpeed / cups.length}`);
  world.free();
});
