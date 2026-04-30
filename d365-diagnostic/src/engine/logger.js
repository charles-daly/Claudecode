'use strict';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const MAX_ENTRIES = 2000;

let _level = 'info';
const _entries = [];

function _record(level, category, message, data) {
  if (LEVELS[level] === undefined || LEVELS[level] > LEVELS[_level]) return;

  const entry = {
    seq:       _entries.length,
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    data: data != null ? JSON.parse(JSON.stringify(data)) : null,
  };

  if (_entries.length >= MAX_ENTRIES) _entries.shift();
  _entries.push(entry);

  if (level === 'error') {
    console.error(`[D365/${category}] ${message}`, data ?? '');
  } else if (level === 'warn') {
    console.warn(`[D365/${category}] ${message}`, data ?? '');
  } else if (_level === 'debug') {
    console.log(`[D365/${level.toUpperCase()}/${category}] ${message}`, data ?? '');
  }
}

function setLevel(level) {
  if (LEVELS[level] !== undefined) _level = level;
}

function getLevel() { return _level; }

function getLogs(filter = {}) {
  let result = [..._entries];
  if (filter.minLevel != null) {
    const min = LEVELS[filter.minLevel] ?? 0;
    result = result.filter(e => LEVELS[e.level] <= min);
  }
  if (filter.category)  result = result.filter(e => e.category === filter.category);
  if (filter.since)     result = result.filter(e => e.timestamp >= filter.since);
  if (filter.limit > 0) result = result.slice(-filter.limit);
  return result;
}

function clear() { _entries.length = 0; }

function stats() {
  const counts = { error: 0, warn: 0, info: 0, debug: 0 };
  for (const e of _entries) counts[e.level] = (counts[e.level] || 0) + 1;
  return { total: _entries.length, level: _level, counts };
}

module.exports = {
  error: (cat, msg, data) => _record('error', cat, msg, data),
  warn:  (cat, msg, data) => _record('warn',  cat, msg, data),
  info:  (cat, msg, data) => _record('info',  cat, msg, data),
  debug: (cat, msg, data) => _record('debug', cat, msg, data),
  setLevel,
  getLevel,
  getLogs,
  clear,
  stats,
};
