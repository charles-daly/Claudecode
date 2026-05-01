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
 * Finds a mapping by either US, French, or Belgian account number.
 * @param {string} account
 * @returns {Object|undefined}
 */
function getMappingByAccount(account) {
  if (!account) return undefined;
  const needle = String(account).trim();
  return getAllMappings().find(m =>
    m.usAccount === needle || m.frAccount === needle || m.beAccount === needle
  );
}

/**
 * Finds a mapping by Belgian PCMN account number.
 * @param {string} beAccount
 * @returns {Object|undefined}
 */
function getMappingByBeAccount(beAccount) {
  if (!beAccount) return undefined;
  const needle = String(beAccount).trim();
  return getAllMappings().find(m => m.beAccount === needle);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ['usAccount', 'frAccount', 'type'];

/**
 * Validates a mapping candidate against business rules.
 * @param {Object}  candidate   The mapping to validate.
 * @param {Array}   existing    Current mappings array (used for duplicate checks).
 * @param {string}  [excludeId] When updating, the id of the mapping being replaced.
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function _validate(candidate, existing, excludeId) {
  const errors   = [];
  const warnings = [];

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!candidate[field] || String(candidate[field]).trim() === '') {
      errors.push(`Field "${field}" is required.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const usAccount = String(candidate.usAccount).trim();
  const frAccount = String(candidate.frAccount).trim();
  const beAccount = candidate.beAccount ? String(candidate.beAccount).trim() : '';
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

  // Warning: same beAccount mapped from a different usAccount (soft conflict)
  if (beAccount) {
    const beConflict = others.find(m => m.beAccount && m.beAccount === beAccount);
    if (beConflict) {
      warnings.push(
        `Belgian account "${beAccount}" is already mapped from US account "${beConflict.usAccount}" (id: ${beConflict.id}). Verify this is intentional.`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
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
    beAccount:   mapping.beAccount ? String(mapping.beAccount).trim() : '',
    type:        String(mapping.type).trim(),
    description: mapping.description ? String(mapping.description).trim() : '',
    module:      mapping.module ? String(mapping.module).trim() : '',
  };

  mappings.push(newMapping);
  data.mappings = mappings;
  _writeFile(data);

  return { success: true, mapping: newMapping, warnings: validation.warnings };
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

  mappings[index] = {
    ...merged,
    beAccount: updates.beAccount !== undefined
      ? (updates.beAccount ? String(updates.beAccount).trim() : '')
      : (mappings[index].beAccount || ''),
  };
  data.mappings   = mappings;
  _writeFile(data);

  return { success: true, mapping: mappings[index], warnings: validation.warnings };
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
 * @param {string} sourceGaap   'us_gaap' | 'french_gaap' | 'belgium_gaap'
 * @param {string} targetGaap   'us_gaap' | 'french_gaap' | 'belgium_gaap'
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
  } else if (sourceGaap === 'belgium_gaap') {
    mapping = all.find(m => m.beAccount === needle) || null;
  } else {
    // Unknown source — try all three
    mapping = all.find(m =>
      m.usAccount === needle || m.frAccount === needle || m.beAccount === needle
    ) || null;
  }

  if (!mapping) {
    return { found: false, mappedAccount: null, mapping: null };
  }

  let mappedAccount = null;
  if (targetGaap === 'french_gaap') {
    mappedAccount = mapping.frAccount || null;
  } else if (targetGaap === 'us_gaap') {
    mappedAccount = mapping.usAccount || null;
  } else if (targetGaap === 'belgium_gaap') {
    mappedAccount = mapping.beAccount || null;
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

  const mappingByBE = all.find(m => m.beAccount && m.beAccount === needle) || null;

  if (!mapping && !mappingByBE) {
    return {
      account,
      mappingFound:  false,
      usAccount:     null,
      frAccount:     null,
      beAccount:     null,
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

  const resolvedMapping = mapping || mappingByBE;
  const isUSAccount  = Boolean(mappingByUS);
  const isBEAccount  = !mappingByUS && !mappingByFR && Boolean(mappingByBE);
  const gaapSide     = isUSAccount ? 'us_gaap' : isBEAccount ? 'belgium_gaap' : 'french_gaap';
  const counterpart  = isUSAccount ? resolvedMapping.frAccount : resolvedMapping.usAccount;

  const gaapMismatch =
    ctxGaap !== 'unknown' && gaapSide !== 'unknown' && gaapSide !== ctxGaap;

  let mappingStatus;
  if (!expectedAccount) {
    mappingStatus = gaapMismatch ? 'incorrect' : 'correct';
  } else {
    const exp = String(expectedAccount).trim();
    mappingStatus = needle === exp
      ? (gaapMismatch ? 'incorrect' : 'correct')
      : 'incorrect';
  }

  return {
    account,
    mappingFound:  true,
    usAccount:     resolvedMapping.usAccount,
    frAccount:     resolvedMapping.frAccount,
    beAccount:     resolvedMapping.beAccount || null,
    counterpart,
    isUSAccount,
    isBEAccount,
    gaapSide,
    gaapMismatch,
    mappingStatus,
    description:   resolvedMapping.description || null,
    type:          resolvedMapping.type || null,
    module:        resolvedMapping.module || null,
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
  getMappingByBeAccount,
  addMapping,
  updateMapping,
  deleteMapping,
  saveMappingsRaw,
  applyMapping,
  analyseAccountMapping,
};
