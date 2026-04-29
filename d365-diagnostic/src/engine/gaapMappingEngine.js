'use strict';

/**
 * gaapMappingEngine.js
 * Reads and writes data/accountMappings.json.
 * Provides CRUD, lookup, and analysis helpers for US GAAP ↔ French GAAP (PCG)
 * account mappings used by the D365 diagnostic engine.
 */

const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

function getMappingsFilePath() {
  if (process.env.NODE_ENV !== 'production') {
    return path.join(__dirname, '../../data/accountMappings.json');
  }
  return path.join(process.resourcesPath, 'data', 'accountMappings.json');
}

// ---------------------------------------------------------------------------
// Raw I/O
// ---------------------------------------------------------------------------

function _readFile() {
  const filePath = getMappingsFilePath();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`gaapMappingEngine: failed to read mappings file at "${filePath}": ${err.message}`);
  }
}

function _writeFile(data) {
  const filePath = getMappingsFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    throw new Error(`gaapMappingEngine: failed to write mappings file at "${filePath}": ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Returns the raw mappings array.
 * @returns {Array<Object>}
 */
function getAllMappings() {
  return _readFile().mappings || [];
}

/**
 * Returns the full JSON object including _meta.
 * @returns {Object}
 */
function getAllMappingsWithMeta() {
  return _readFile();
}

/**
 * Finds a mapping by US GAAP account number.
 * @param {string} usAccount
 * @returns {Object|undefined}
 */
function getMapping(usAccount) {
  if (!usAccount) return undefined;
  const needle = String(usAccount).trim();
  return getAllMappings().find(m => m.usAccount === needle);
}

/**
 * Finds a mapping by either US or French account number.
 * @param {string} account
 * @returns {Object|undefined}
 */
function getMappingByAccount(account) {
  if (!account) return undefined;
  const needle = String(account).trim();
  return getAllMappings().find(m => m.usAccount === needle || m.frAccount === needle);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ['usAccount', 'frAccount', 'type'];

/**
 * Validates a mapping candidate against business rules.
 * @param {Object}  candidate  The mapping to validate.
 * @param {Array}   existing   Current mappings array (used for duplicate checks).
 * @param {string}  [excludeId] When updating, the id of the mapping being replaced.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function _validate(candidate, existing, excludeId) {
  const errors = [];

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!candidate[field] || String(candidate[field]).trim() === '') {
      errors.push(`Field "${field}" is required.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const usAccount = String(candidate.usAccount).trim();
  const frAccount = String(candidate.frAccount).trim();
  const type      = String(candidate.type).trim();

  const others = excludeId
    ? existing.filter(m => m.id !== excludeId)
    : existing;

  // Duplicate US account
  const dupUS = others.find(m => m.usAccount === usAccount);
  if (dupUS) {
    errors.push(`US account "${usAccount}" is already mapped (id: ${dupUS.id}).`);
  }

  // Conflict: same frAccount + same type from a different usAccount
  const conflict = others.find(m => m.frAccount === frAccount && m.type === type);
  if (conflict) {
    errors.push(
      `French account "${frAccount}" with type "${type}" is already mapped from US account "${conflict.usAccount}" (id: ${conflict.id}).`
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generates a new unique id of the form "m###".
 * @param {Array} mappings
 * @returns {string}
 */
function _generateId(mappings) {
  const nums = mappings
    .map(m => {
      const match = /^m(\d+)$/.exec(m.id || '');
      return match ? parseInt(match[1], 10) : 0;
    });
  const max = nums.length > 0 ? Math.max(...nums) : 0;
  return `m${String(max + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Adds a new mapping.
 * @param {Object} mapping  Must contain usAccount, frAccount, type.
 * @returns {{ success: boolean, mapping?: Object, errors?: string[] }}
 */
function addMapping(mapping) {
  const data     = _readFile();
  const mappings = data.mappings || [];

  const { valid, errors } = _validate(mapping, mappings, null);
  if (!valid) {
    return { success: false, errors };
  }

  const newMapping = {
    id:          _generateId(mappings),
    usAccount:   String(mapping.usAccount).trim(),
    frAccount:   String(mapping.frAccount).trim(),
    type:        String(mapping.type).trim(),
    description: mapping.description ? String(mapping.description).trim() : '',
    module:      mapping.module ? String(mapping.module).trim() : '',
  };

  mappings.push(newMapping);
  data.mappings = mappings;
  _writeFile(data);

  return { success: true, mapping: newMapping };
}

/**
 * Updates an existing mapping by id.
 * @param {string} id
 * @param {Object} updates  Partial mapping fields to merge.
 * @returns {{ success: boolean, mapping?: Object, errors?: string[] }}
 */
function updateMapping(id, updates) {
  const data     = _readFile();
  const mappings = data.mappings || [];

  const index = mappings.findIndex(m => m.id === id);
  if (index === -1) {
    return { success: false, errors: [`Mapping with id "${id}" not found.`] };
  }

  const merged = Object.assign({}, mappings[index], updates, { id });

  const { valid, errors } = _validate(merged, mappings, id);
  if (!valid) {
    return { success: false, errors };
  }

  mappings[index] = merged;
  data.mappings   = mappings;
  _writeFile(data);

  return { success: true, mapping: merged };
}

/**
 * Deletes a mapping by id.
 * @param {string} id
 * @returns {{ success: boolean, errors?: string[] }}
 */
function deleteMapping(id) {
  const data     = _readFile();
  const mappings = data.mappings || [];

  const index = mappings.findIndex(m => m.id === id);
  if (index === -1) {
    return { success: false, errors: [`Mapping with id "${id}" not found.`] };
  }

  mappings.splice(index, 1);
  data.mappings = mappings;
  _writeFile(data);

  return { success: true };
}

/**
 * Overwrites the entire mappings array (used by UI bulk save).
 * No individual validation is applied — caller is responsible.
 * @param {Array} mappings
 * @returns {{ success: boolean, errors?: string[] }}
 */
function saveMappingsRaw(mappings) {
  if (!Array.isArray(mappings)) {
    return { success: false, errors: ['saveMappingsRaw: mappings must be an array.'] };
  }
  const data    = _readFile();
  data.mappings = mappings;
  _writeFile(data);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Apply / analyse
// ---------------------------------------------------------------------------

/**
 * Applies a mapping in a given translation direction.
 *
 * @param {string} account      The account number to look up.
 * @param {string} sourceGaap   'us_gaap' | 'french_gaap'
 * @param {string} targetGaap   'french_gaap' | 'us_gaap'
 * @returns {{ found: boolean, mappedAccount: string|null, mapping: Object|null }}
 */
function applyMapping(account, sourceGaap, targetGaap) {
  if (!account) {
    return { found: false, mappedAccount: null, mapping: null };
  }

  const needle  = String(account).trim();
  const all     = getAllMappings();
  let   mapping = null;

  if (sourceGaap === 'us_gaap') {
    mapping = all.find(m => m.usAccount === needle) || null;
  } else if (sourceGaap === 'french_gaap') {
    mapping = all.find(m => m.frAccount === needle) || null;
  } else {
    // Unknown source — try both
    mapping = all.find(m => m.usAccount === needle || m.frAccount === needle) || null;
  }

  if (!mapping) {
    return { found: false, mappedAccount: null, mapping: null };
  }

  let mappedAccount = null;
  if (targetGaap === 'french_gaap') {
    mappedAccount = mapping.frAccount;
  } else if (targetGaap === 'us_gaap') {
    mappedAccount = mapping.usAccount;
  }

  return { found: true, mappedAccount, mapping };
}

// ---------------------------------------------------------------------------
// Full analysis
// ---------------------------------------------------------------------------

/**
 * Performs a full GAAP mapping analysis for a given account.
 *
 * @param {string} account          The account number posted in the voucher.
 * @param {string} expectedAccount  The account number expected per configuration / rules.
 * @param {Object} context          { gaap: 'us_gaap'|'french_gaap', module?: string, ... }
 * @returns {Object}
 */
function analyseAccountMapping(account, expectedAccount, context) {
  const needle  = account ? String(account).trim() : '';
  const ctxGaap = context && context.gaap ? String(context.gaap) : 'unknown';
  const all     = getAllMappings();

  // Determine whether this is a US or FR account
  const mappingByUS = all.find(m => m.usAccount === needle);
  const mappingByFR = all.find(m => m.frAccount === needle);
  const mapping     = mappingByUS || mappingByFR || null;

  if (!mapping) {
    return {
      account,
      mappingFound:  false,
      usAccount:     null,
      frAccount:     null,
      counterpart:   null,
      isUSAccount:   null,
      gaapSide:      'unknown',
      gaapMismatch:  false,
      mappingStatus: 'missing',
      description:   null,
      type:          null,
      module:        null,
      expected:      expectedAccount,
    };
  }

  const isUSAccount = Boolean(mappingByUS);
  const gaapSide    = isUSAccount ? 'us_gaap' : 'french_gaap';
  const counterpart = isUSAccount ? mapping.frAccount : mapping.usAccount;

  // A mismatch occurs when the account is on the wrong GAAP side for the
  // expected context (e.g. a French PCG account appearing in a US-GAAP context).
  const gaapMismatch =
    ctxGaap !== 'unknown' && gaapSide !== 'unknown' && gaapSide !== ctxGaap;

  // Determine mapping status
  let mappingStatus;
  if (!expectedAccount) {
    // No expectation provided — consider found = correct
    mappingStatus = gaapMismatch ? 'incorrect' : 'correct';
  } else {
    const exp = String(expectedAccount).trim();
    if (needle === exp) {
      mappingStatus = gaapMismatch ? 'incorrect' : 'correct';
    } else {
      mappingStatus = 'incorrect';
    }
  }

  return {
    account,
    mappingFound:  true,
    usAccount:     mapping.usAccount,
    frAccount:     mapping.frAccount,
    counterpart,
    isUSAccount,
    gaapSide,
    gaapMismatch,
    mappingStatus,
    description:   mapping.description || null,
    type:          mapping.type || null,
    module:        mapping.module || null,
    expected:      expectedAccount,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  getAllMappings,
  getAllMappingsWithMeta,
  getMapping,
  getMappingByAccount,
  addMapping,
  updateMapping,
  deleteMapping,
  saveMappingsRaw,
  applyMapping,
  analyseAccountMapping,
};
