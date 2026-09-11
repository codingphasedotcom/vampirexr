// Normalized ray against a scaled enemy sphere. Returns the first forward surface.
export function traceEnemy(origin, dir, enemy, time = 0, range = 60) {
  if (enemy.dead) return null;
  const bob = enemy.t.fly ? Math.sin(time * (enemy.t.boss ? 3 : 5) + enemy.phase) * (enemy.t.boss ? 0.3 : 0.18) : 0;
  const y = enemy.t.y * (enemy.scale ?? 1) + bob;
  const x = enemy.x - origin.x, dy = y - origin.y, z = enemy.z - origin.z;
  const along = x * dir.x + dy * dir.y + z * dir.z;
  const radius = Math.max(0.4, enemy.size * 0.6);
  const distanceSq = Math.max(0, x*x + dy*dy + z*z - along*along);
  if (distanceSq > radius*radius) return null;
  const half = Math.sqrt(radius*radius - distanceSq);
  if (along + half < 0) return null;
  const t = Math.max(0, along - half);
  if (t > range) return null;
  return { e: enemy, t, precision: distanceSq <= (radius * 0.45) ** 2 };
}
