'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Module registry ──────────────────────────────────────────────────────────
// Maps context.module values → module folder names under /modules/
const MODULE_FOLDER_MAP = {
  pma:            'pma',
  procurement:    'procurement',
  sales:          'sales',
  fixed_assets:   'fixedAssets',
  inventory:      'inventory',
  lease:          'lease',
  general_ledger: 'generalLedger',
};

const MODULE_METADATA = {
  pma: {
    label:       'Project Management & Accounting',
    description: 'Project cost, revenue, and WIP accounting',
    icon:        'PMA',
    color:       '#8b5cf6',
  },
  procurement: {
    label:       'Procurement (P2P)',
    description: 'Procure-to-Pay: vendor invoices, receipts, and accruals',
    icon:        'P2P',
    color:       '#f59e0b',
  },
  sales: {
    label:       'Sales (O2C)',
    description: 'Order-to-Cash: customer invoices, revenue recognition, and COGS',
    icon:        'O2C',
    color:       '#22c55e',
  },
  fixed_assets: {
    label:       'Fixed Assets',
    description: 'Acquisition, depreciation, disposal, and revaluation of tangible assets',
    icon:        'FA',
    color:       '#3b82f6',
  },
  inventory: {
    label:       'Inventory Management',
    description: 'Inventory receipt, issue, transfer, and valuation',
    icon:        'INV',
    color:       '#06b6d4',
  },
  lease: {
    label:       'Lease (IFRS 16 / ASC 842)',
    description: 'Right-of-use asset and lease liability accounting',
    icon:        'LSE',
    color:       '#ec4899',
  },
  general_ledger: {
    label:       'General Ledger',
    description: 'Manual journals, allocations, periodic entries, intercompany',
    icon:        'GL',
    color:       '#94a3b8',
  },
};

// ─── Path resolution ──────────────────────────────────────────────────────────
function resolveModulesBase() {
  const isDev = process.env.NODE_ENV !== 'production';
  return isDev
    ? path.join(__dirname, '..', '..', 'modules')
    : path.join(process.resourcesPath, 'modules');
}

// ─── ModuleLoader class ───────────────────────────────────────────────────────
class ModuleLoader {
  constructor() {
    this._cache = {};
  }

  /**
   * Load a complete module pack (rules + sources + transactions).
   * Results are cached after first load.
   *
   * @param {string} moduleName  — e.g. 'lease', 'fixed_assets', 'pma'
   * @returns {{ name, metadata, rules, sources, transactions }}
   */
  loadModule(moduleName) {
    if (!moduleName) moduleName = 'lease';
    if (this._cache[moduleName]) return this._cache[moduleName];

    const folder = MODULE_FOLDER_MAP[moduleName] || moduleName;
    const base   = path.join(resolveModulesBase(), folder);

    const mod = {
      name:         moduleName,
      folder,
      metadata:     MODULE_METADATA[moduleName] || { label: moduleName, description: '', color: '#475569' },
      rules:        this._readJSON(base, 'rules.json'),
      sources:      this._readJSON(base, 'sources.json'),
      transactions: this._readJSON(base, 'transactions.json'),
    };

    this._cache[moduleName] = mod;
    return mod;
  }

  _readJSON(base, file) {
    const p = path.join(base, file);
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (err) {
      throw new Error(`ModuleLoader: cannot read ${p} — ${err.message}`);
    }
  }

  /** List all registered module names. */
  listModules() {
    return Object.keys(MODULE_FOLDER_MAP);
  }

  /** Return metadata for all modules (for UI rendering). */
  getMetadata() {
    return MODULE_METADATA;
  }

  /** Flush the cache — useful in dev/hot-reload scenarios. */
  clearCache() {
    this._cache = {};
  }

  /**
   * Resolve a transaction type key to its definition.
   * Handles legacy camelCase ↔ snake_case and plural/singular normalisations.
   */
  resolveTransactionType(moduleName, rawType) {
    const mod = this.loadModule(moduleName);
    if (!rawType) return null;

    // Direct match first
    if (mod.transactions[rawType]) return { key: rawType, def: mod.transactions[rawType] };

    // Case-insensitive match
    const lower = rawType.toLowerCase();
    for (const [k, v] of Object.entries(mod.transactions)) {
      if (k.toLowerCase() === lower) return { key: k, def: v };
    }

    // Legacy snake_case → known camelCase mappings (backwards-compat)
    const legacyMap = {
      recognition:      'LeaseCommencement',
      interest_accrual: 'InterestAccrual',
      payment:          'Payment',
      depreciation:     'Depreciation',
      acquisition:      'Acquisition',
      disposal:         'Disposal',
      invoice:          'Invoice',
      accrual:          'Accrual',
      product_receipt:  'ProductReceipt',
      revenue:          'Revenue',
      cogs:             'COGS',
      issue:            'Issue',
      receipt:          'Receipt',
      transfer:         'Transfer',
      adjustment:       'Adjustment',
      expense:          'Expense',
      wip:              'WIP',
      manual:           'Manual',
      allocation:       'Allocation',
      periodic:         'Periodic',
    };

    const mapped = legacyMap[lower];
    if (mapped && mod.transactions[mapped]) return { key: mapped, def: mod.transactions[mapped] };

    return null;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
const moduleLoader = new ModuleLoader();

module.exports = { moduleLoader, MODULE_METADATA, MODULE_FOLDER_MAP };
