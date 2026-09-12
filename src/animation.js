// Advance clip time continuously from distance travelled; teleports are not footsteps.
export function advanceWalk(e, dt) {
  const distance = Math.hypot(e.x - (e.walkX ?? e.x), e.z - (e.walkZ ?? e.z));
  e.walkX = e.x; e.walkZ = e.z;
  if (dt <= 0) return e.walkTime ?? 0;
  const strideSpeed = Math.max(0.1, e.t.speed * (e.scale ?? 1));
  const teleported = distance > Math.max(0.8, strideSpeed * dt * 4);
  const target = teleported ? 0.2 : Math.max(0.2, Math.min(2, distance / (dt * strideSpeed)));
  e.walkRate = (e.walkRate ?? target) + (target - (e.walkRate ?? target)) * (1 - Math.exp(-8 * dt));
  e.walkTime = (e.walkTime ?? 0) + dt * e.walkRate;
  return e.walkTime;
}
