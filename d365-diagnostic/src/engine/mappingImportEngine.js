'use strict';

/**
 * mappingImportEngine.js
 * Excel / CSV bulk import for the multi-GAAP mapping table.
 *
 * Two-phase flow:
 *   1. previewImport(filePath)  → parses the file, validates rows, returns preview
 *   2. applyImport(rows, opts)  → writes validated rows into accountMappings.json
 */

const XLSX   = require('xlsx');
const { getAllMappings, saveMappingsRaw } = require('./gaapMappingEngine');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set([
  'Asset', 'Liability', 'Revenue', 'Cost', 'COGS', 'Expense',
  'Receivable', 'Payable', 'Accrual', 'Depreciation',
  'Accumulated Depreciation', 'Interest', 'Inventory', 'Equity', 'Other',
]);

const VALID_MODULES = new Set([
  'pma', 'procurement', 'sales', 'fixed_assets',
  'inventory', 'lease', 'general_ledger', '',
]);

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

function _norm(s) {
  return String(s).toLowerCase().replace(/[\s_\-\.]/g, '');
}

const COL_CANDIDATES = {
  usAccount:   ['usaccount', 'us', 'usgaap', 'usgl', 'glaccount', 'account', 'accountnumber'],
  frAccount:   ['fraccount', 'fr', 'frenchpcg', 'pcg', 'frenchaccount', 'pcgaccount'],
  beAccount:   ['beaccount', 'be', 'belgianpcmn', 'pcmn', 'belgiumaccount', 'belgianaccount', 'belgium'],
  type:        ['type', 'accounttype', 'accttype', 'category'],
  description: ['description', 'desc', 'name', 'label', 'text'],
  module:      ['module', 'd365module', 'source', 'origin'],
};

function detectColumns(headers) {
  const result = {};
  const normHeaders = headers.map(h => ({ original: h, norm: _norm(h) }));

  for (const [field, candidates] of Object.entries(COL_CANDIDATES)) {
    let found = null;
    for (const c of candidates) {
      const match = normHeaders.find(h => h.norm === c || h.norm.startsWith(c) || c.startsWith(h.norm));
      if (match) { found = match.original; break; }
    }
    result[field] = found;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Row normalization
// ---------------------------------------------------------------------------

function _normalizeRow(raw, colMap, rowNum) {
  const get = (key) => colMap[key] ? String(raw[colMap[key]] ?? '').trim() : '';
  return {
    rowNum,
    usAccount:   get('usAccount').replace(/\s/g, ''),
    frAccount:   get('frAccount').replace(/\s/g, ''),
    beAccount:   get('beAccount').replace(/\s/g, ''),
    type:        get('type'),
    description: get('description'),
    module:      get('module').toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Per-row validation
// ---------------------------------------------------------------------------

function _validateRow(row, existingMap, importedUsAccounts) {
  const errors   = [];
  const warnings = [];
  let   status   = 'valid';

  // Required
  if (!row.usAccount)  errors.push('US account is required');
  if (!row.type)       errors.push('Type is required');

  if (errors.length > 0) {
    return { ...row, status: 'invalid', errors, warnings };
  }

  // Type check
  if (!VALID_TYPES.has(row.type)) {
    warnings.push(`Type "${row.type}" is not a standard account type`);
  }

  // Module check
  if (row.module && !VALID_MODULES.has(row.module)) {
    warnings.push(`Module "${row.module}" is not a recognised D365 module`);
  }

  // Duplicate within import batch
  if (importedUsAccounts.has(row.usAccount)) {
    errors.push(`US account "${row.usAccount}" appears more than once in the import file`);
    return { ...row, status: 'invalid', errors, warnings };
  }

  // Check against existing mappings
  const existing = existingMap[row.usAccount];
  if (existing) {
    if (existing.frAccount === row.frAccount && existing.beAccount === (row.beAccount || '')) {
      status = 'duplicate';
      warnings.push(`Identical mapping already exists (id: ${existing.id})`);
    } else {
      status = 'conflict';
      warnings.push(
        `US account "${row.usAccount}" already mapped → FR: ${existing.frAccount}, BE: ${existing.beAccount || '–'} (id: ${existing.id})`
      );
    }
  } else {
    status = 'new';
  }

  // Warn if FR account missing
  if (!row.frAccount) {
    warnings.push('French PCG account is empty — GAAP traceability will be unavailable');
  }

  return { ...row, status, errors, warnings };
}

// ---------------------------------------------------------------------------
// Public: preview
// ---------------------------------------------------------------------------

/**
 * Parses an Excel or CSV file and returns a preview of what would be imported.
 *
 * @param {string} filePath
 * @returns {{
 *   success: boolean,
 *   colMap: Object,
 *   rows: Array,
 *   stats: { total, new, duplicate, conflict, invalid },
 *   errors: string[],
 * }}
 */
function previewImport(filePath) {
  let workbook;
  try {
    workbook = XLSX.readFile(filePath, { cellDates: false });
  } catch (err) {
    return { success: false, rows: [], stats: _emptyStats(), errors: [`Cannot read file: ${err.message}`] };
  }

  // Use first sheet
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { success: false, rows: [], stats: _emptyStats(), errors: ['File contains no sheets'] };
  }

  const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (rawRows.length === 0) {
    return { success: false, rows: [], stats: _emptyStats(), errors: ['Sheet is empty or has no data rows'] };
  }

  const colMap = detectColumns(Object.keys(rawRows[0]));

  if (!colMap.usAccount) {
    return {
      success: false,
      rows: [],
      stats: _emptyStats(),
      errors: [
        'Could not detect a US Account column. Expected a column named "US_Account", "USAccount", "Account", or similar.',
        `Columns found: ${Object.keys(rawRows[0]).join(', ')}`,
      ],
    };
  }

  // Build existing map for fast lookup
  let existing = [];
  try { existing = getAllMappings(); } catch (_) {}
  const existingMap = {};
  for (const m of existing) { existingMap[m.usAccount] = m; }

  const importedUsAccounts = new Set();
  const rows = rawRows.map((raw, i) => {
    const row = _normalizeRow(raw, colMap, i + 2); // +2: 1-based + header row
    const validated = _validateRow(row, existingMap, importedUsAccounts);
    if (validated.status !== 'invalid') {
      importedUsAccounts.add(row.usAccount);
    }
    return validated;
  });

  const stats = {
    total:     rows.length,
    new:       rows.filter(r => r.status === 'new').length,
    duplicate: rows.filter(r => r.status === 'duplicate').length,
    conflict:  rows.filter(r => r.status === 'conflict').length,
    invalid:   rows.filter(r => r.status === 'invalid').length,
  };

  return { success: true, colMap, rows, stats, errors: [] };
}

// ---------------------------------------------------------------------------
// Public: apply
// ---------------------------------------------------------------------------

/**
 * Applies a validated set of rows to the mapping store.
 *
 * @param {Array}  rows         From previewImport().rows (only non-invalid rows are used)
 * @param {Object} opts
 *   @param {string} opts.mode        'merge' | 'overwrite'
 *     merge:     add new rows, leave existing untouched (default)
 *     overwrite: add new rows + replace conflicting rows
 *   @param {string} opts.onConflict  'skip' | 'replace' (only used in merge mode)
 *     skip:    leave conflicting rows unchanged
 *     replace: replace conflicting rows with import data
 * @returns {{ success: boolean, added: number, updated: number, skipped: number, errors: string[] }}
 */
function applyImport(rows, opts = {}) {
  const mode       = opts.mode       || 'merge';
  const onConflict = opts.onConflict || 'skip';

  let existing = [];
  try { existing = getAllMappings(); } catch (err) {
    return { success: false, added: 0, updated: 0, skipped: 0, errors: [err.message] };
  }

  const existingMap = {};
  for (const m of existing) { existingMap[m.usAccount] = m; }

  let added   = 0;
  let updated = 0;
  let skipped = 0;

  // Generate next id
  let maxId = existing.reduce((max, m) => {
    const n = parseInt((m.id || '').replace(/\D/g, ''), 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);

  const nextId = () => `m${String(++maxId).padStart(3, '0')}`;

  for (const row of rows) {
    if (row.status === 'invalid') continue;

    const candidate = {
      usAccount:   row.usAccount,
      frAccount:   row.frAccount || '',
      beAccount:   row.beAccount || '',
      type:        row.type,
      description: row.description || '',
      module:      row.module || '',
    };

    if (row.status === 'new') {
      existing.push({ id: nextId(), ...candidate });
      added++;
    } else if (row.status === 'duplicate') {
      skipped++;
    } else if (row.status === 'conflict') {
      const shouldReplace = mode === 'overwrite' || onConflict === 'replace';
      if (shouldReplace) {
        const idx = existing.findIndex(m => m.usAccount === row.usAccount);
        if (idx !== -1) {
          existing[idx] = { ...existing[idx], ...candidate };
          updated++;
        }
      } else {
        skipped++;
      }
    }
  }

  try {
    saveMappingsRaw(existing);
  } catch (err) {
    return { success: false, added, updated, skipped, errors: [err.message] };
  }

  return { success: true, added, updated, skipped, errors: [] };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _emptyStats() {
  return { total: 0, new: 0, duplicate: 0, conflict: 0, invalid: 0 };
}

/**
 * Generates a template CSV string for download.
 * @returns {string}
 */
function generateTemplateCSV() {
  const header = 'US_Account,FR_Account,BE_Account,Type,Description,Module';
  const examples = [
    '110000,411,400,Receivable,Trade accounts receivable,sales',
    '200000,401,440,Payable,Trade accounts payable,procurement',
    '400100,706,704,Revenue,Service revenue,pma',
  ];
  return [header, ...examples].join('\n');
}

module.exports = { previewImport, applyImport, generateTemplateCSV, detectColumns };
