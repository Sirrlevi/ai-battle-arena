export function createObjectPool(factory, reset, size = 256) {
  return { free: Array.from({ length: size }, factory), active: [], factory, reset };
}
export function acquire(pool, init = {}) {
  const item = pool.free.pop() || pool.factory();
  pool.reset(item, init);
  pool.active.push(item);
  return item;
}
export function releaseInactive(pool) {
  pool.active = pool.active.filter((item) => {
    if (item.alive) return true;
    pool.free.push(item);
    return false;
  });
}
