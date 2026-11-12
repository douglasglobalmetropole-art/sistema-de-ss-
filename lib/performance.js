'use strict';
// Caches locais limitados; cada banco/divisao possui seu proprio namespace.
const registries = new Set();
let generation = 0;
class BoundedMap extends Map {
  constructor(max = 200) { super(); this.max = max; }
  set(key, value) {
    this.delete(key); super.set(key, value);
    while (this.size > this.max) this.delete(this.keys().next().value);
    return this;
  }
}
function scopedMap(scope = () => 'principal', max = 120) {
  const maps = new Map();
  registries.add(maps);
  const current = () => {
    const key = scope();
    if (!maps.has(key)) maps.set(key, new BoundedMap(max));
    return maps.get(key);
  };
  return {
    get: key => current().get(key), set: (key, value) => current().set(key, value),
    delete: key => current().delete(key), clear: () => current().clear(),
    keys: () => current().keys(), get size() { return current().size; }
  };
}
function invalidate() {
  generation++;
  for (const maps of registries) maps.clear();
}
function singleFlight(max = 200) {
  const pending = new Map();
  return function run(key, load) {
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= max) return Promise.resolve().then(load);
    const promise = Promise.resolve().then(load).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}
const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false
});
const formatDate = value => value ? dateFormatter.format(new Date(value)).replace(',', '') : '';
function positiveInt(value, fallback, max = 100) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}
module.exports = { BoundedMap, scopedMap, singleFlight, invalidate, formatDate, positiveInt,
  getGeneration: () => generation };
