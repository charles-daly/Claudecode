import React, { useState, useMemo } from 'react';

// ─── Inline FX helpers (renderer-side, no Node require) ──────────────────────

const FX_EPS = 0.005;

function enrichLineFx(line, currentRates, isSettled, acctgCcy) {
  const ccy = String(line.transactionCurrency || line.currency || acctgCcy).trim().toUpperCase();
  if (ccy === acctgCcy) return { ...line, hasFxExposure: false };

  const dr     = parseFloat(line.debit)  || 0;
  const cr     = parseFloat(line.credit) || 0;
  const amount = dr || cr;
  if (amount === 0) return { ...line, hasFxExposure: false };

  const side     = dr > 0 ? 'debit' : 'credit';
  const origRate = parseFloat(line.exchangeRate) || 1;
  // User's currentRates take priority over the entry's pre-loaded spotRate
  const curRate  = currentRates[ccy] ?? parseFloat(line.spotRate) ?? origRate;

  const origAcctg = parseFloat((amount * origRate).toFixed(2));
  const curAcctg  = parseFloat((amount * curRate ).toFixed(2));
  const rawDiff   = parseFloat((curAcctg - origAcctg).toFixed(2));
  const econDiff  = side === 'debit' ? rawDiff : -rawDiff;
  const gl        = Math.abs(econDiff) < FX_EPS ? 'neutral' : econDiff > 0 ? 'gain' : 'loss';

  return {
    ...line, hasFxExposure: true,
    originalAmount: amount, originalCurrency: ccy,
    originalExchangeRate: origRate, originalAccountingAmount: origAcctg,
    currentExchangeRate: curRate, currentAccountingAmount: curAcctg,
    fxDifference: rawDiff, economicFxDiff: econDiff,
    gainOrLoss: gl, type: isSettled ? 'realized' : 'unrealized', side,
  };
}

function computeAllFx(voucherAnalysis, acctgCcy, currentRates, settledVouchers) {
  const rows = [];
  if (!voucherAnalysis) return rows;
  Object.entries(voucherAnalysis).forEach(([sheetName, sheet]) => {
    (sheet.vouchers || []).forEach(v => {
      const voucherToggled = settledVouchers.has(v.voucherId);
      const fxLines = (v.entries || [])
        .map(e => {
          // User toggle overrides all; fallback to per-line isSettled from sample data
          const lineSettled = voucherToggled || (e.isSettled === true);
          return enrichLineFx(e, currentRates, lineSettled, acctgCcy);
        })
        .filter(l => l.hasFxExposure);
      if (!fxLines.length) return;

      const gains    = fxLines.filter(l => l.gainOrLoss === 'gain');
      const losses   = fxLines.filter(l => l.gainOrLoss === 'loss');
      const totalGain = parseFloat(gains .reduce((s, l) => s + l.economicFxDiff, 0).toFixed(2));
      const totalLoss = parseFloat(losses.reduce((s, l) => s + l.economicFxDiff, 0).toFixed(2));
      const netFx     = parseFloat((totalGain + totalLoss).toFixed(2));

      rows.push({
        voucherId: v.voucherId, sheetName, isSettled, fxLines,
        totalGain, totalLoss, netFx,
        netType: netFx > FX_EPS ? 'gain' : netFx < -FX_EPS ? 'loss' : 'neutral',
      });
    });
  });
  return rows;
}

function detectInitialRates(voucherAnalysis, acctgCcy) {
  const rates = {};
  if (!voucherAnalysis) return rates;
  Object.values(voucherAnalysis).forEach(sheet =>
    (sheet.vouchers || []).forEach(v =>
      (v.entries || []).forEach(e => {
        const ccy = String(e.transactionCurrency || e.currency || acctgCcy).trim().toUpperCase();
        if (ccy !== acctgCcy && !rates[ccy]) {
          rates[ccy] = parseFloat(e.spotRate) || parseFloat(e.exchangeRate) || 1;
        }
      })
    )
  );
  return rates;
}

function detectInitialSettled(voucherAnalysis, acctgCcy) {
  const s = new Set();
  if (!voucherAnalysis) return s;
  Object.values(voucherAnalysis).forEach(sheet =>
    (sheet.vouchers || []).forEach(v => {
      // Only mark settled if ALL fx-exposed lines explicitly have isSettled: true
      const fxEntries = (v.entries || []).filter(e => {
        const ccy = String(e.transactionCurrency || e.currency || acctgCcy).trim().toUpperCase();
        return ccy !== acctgCcy && ((parseFloat(e.debit) || parseFloat(e.credit) || 0) > 0);
      });
      if (fxEntries.length > 0 && fxEntries.every(e => e.isSettled === true)) s.add(v.voucherId);
    })
  );
  return s;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FxAnalysis({ result }) {
  const acctgCcy = (result?.context?.accountingCurrency || 'EUR').toUpperCase();
  const { voucherAnalysis } = result || {};

  const [currentRates, setCurrentRates]     = useState(() => detectInitialRates(voucherAnalysis, acctgCcy));
  const [settledVouchers, setSettledVouchers] = useState(() => detectInitialSettled(voucherAnalysis, acctgCcy));
  const [selectedId, setSelectedId]          = useState(null);

  const fxRows = useMemo(
    () => computeAllFx(voucherAnalysis, acctgCcy, currentRates, settledVouchers),
    [voucherAnalysis, acctgCcy, currentRates, settledVouchers]
  );

  const totalGain = parseFloat(fxRows.reduce((s, v) => s + v.totalGain, 0).toFixed(2));
  const totalLoss = parseFloat(fxRows.reduce((s, v) => s + v.totalLoss, 0).toFixed(2));
  const netFx     = parseFloat((totalGain + totalLoss).toFixed(2));
  const foreignCcys = Object.keys(currentRates);

  if (!voucherAnalysis) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>💱</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8' }}>No voucher data</div>
        <p style={{ fontSize: 13, color: '#475569', marginTop: 6 }}>Import an Excel file and run the diagnostic first.</p>
      </div>
    );
  }

  if (!foreignCcys.length) {
    return (
      <div style={S.center}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: '#22c55e', marginBottom: 6 }}>All entries in {acctgCcy}</div>
        <p style={{ fontSize: 13, color: '#475569' }}>No foreign currency exposure detected.</p>
      </div>
    );
  }

  const selected = selectedId ? fxRows.find(v => v.voucherId === selectedId) : null;

  const toggleSettled = (id) =>
    setSettledVouchers(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const updateRate = (ccy, raw) => {
    const v = parseFloat(raw);
    if (!isNaN(v) && v > 0) setCurrentRates(p => ({ ...p, [ccy]: v }));
  };

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>FX Gain / Loss Analysis</h1>
        <p style={{ fontSize: 13, color: '#64748b' }}>
          Realized and unrealized foreign exchange exposure in <strong style={{ color: '#a78bfa' }}>{acctgCcy}</strong>.
          Toggle settlement status and adjust current rates to model gain/loss scenarios.
        </p>
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
        <SummaryCard label="Total FX Gain" value={totalGain} currency={acctgCcy} color="#22c55e" bg="#052e16" />
        <SummaryCard label="Total FX Loss" value={totalLoss} currency={acctgCcy} color="#ef4444" bg="#1c0a0a" sign />
        <NetCard netFx={netFx} currency={acctgCcy} />
      </div>

      {/* ── Current rates panel ── */}
      <div style={{ ...S.card, marginBottom: 20, padding: '14px 18px' }}>
        <div style={S.sectionTitle}>Current / Spot Exchange Rates</div>
        <p style={{ fontSize: 12, color: '#475569', marginBottom: 12 }}>
          Adjust rates to model FX impact. Rates shown as units of {acctgCcy} per 1 foreign unit.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {foreignCcys.map(ccy => (
            <RateInput key={ccy} ccy={ccy} rate={currentRates[ccy]} acctgCcy={acctgCcy} onChange={v => updateRate(ccy, v)} />
          ))}
        </div>
      </div>

      {/* ── Main content: voucher list + detail ── */}
      <div style={{ display: 'flex', gap: 16 }}>

        {/* Voucher table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.sectionTitle}>FX Exposure by Voucher ({fxRows.length})</div>
          {fxRows.length === 0
            ? <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 13 }}>
                No FX differences at current rates — adjust rates above to model scenarios.
              </div>
            : (
              <div style={S.card}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={S.thead}>
                      <th style={S.th}>Voucher</th>
                      <th style={S.th}>Sheet</th>
                      <th style={S.th}>Currencies</th>
                      <th style={{ ...S.th, textAlign: 'right' }}>FX Gain</th>
                      <th style={{ ...S.th, textAlign: 'right' }}>FX Loss</th>
                      <th style={{ ...S.th, textAlign: 'right' }}>Net FX</th>
                      <th style={S.th}>Type</th>
                      <th style={{ ...S.th, textAlign: 'center' }}>Settled?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fxRows.map(row => (
                      <VoucherRow
                        key={row.voucherId} row={row} acctgCcy={acctgCcy}
                        isSelected={selectedId === row.voucherId}
                        onSelect={() => setSelectedId(selectedId === row.voucherId ? null : row.voucherId)}
                        onToggle={() => toggleSettled(row.voucherId)}
                        isSettled={settledVouchers.has(row.voucherId)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ width: 460, flexShrink: 0 }}>
            <VoucherDetail voucher={selected} acctgCcy={acctgCcy} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, currency, color, bg, sign }) {
  const display = Math.abs(value).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div style={{ background: bg, border: `1px solid ${color}33`, borderRadius: 10, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: 'monospace' }}>
        {sign && value < 0 ? '−' : ''}{currency} {display}
      </div>
    </div>
  );
}

function NetCard({ netFx, currency }) {
  const isGain    = netFx >  FX_EPS;
  const isLoss    = netFx < -FX_EPS;
  const color     = isGain ? '#22c55e' : isLoss ? '#ef4444' : '#64748b';
  const bg        = isGain ? '#052e16' : isLoss ? '#1c0a0a' : '#1a1f2e';
  const label     = isGain ? 'Net FX Position — GAIN' : isLoss ? 'Net FX Position — LOSS' : 'Net FX Position';
  const display   = Math.abs(netFx).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div style={{ background: bg, border: `1px solid ${color}33`, borderRadius: 10, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: 'monospace' }}>
        {isLoss ? '−' : ''}{currency} {display}
      </div>
    </div>
  );
}

function RateInput({ ccy, rate, acctgCcy, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: 0.5 }}>
        {ccy} / {acctgCcy}
      </label>
      <input
        style={{
          background: '#0f172a', border: '1px solid #f59e0b44', borderRadius: 6,
          color: '#f59e0b', padding: '6px 10px', fontSize: 13, fontWeight: 700,
          fontFamily: 'monospace', outline: 'none', width: '100%', textAlign: 'right',
        }}
        value={rate}
        onChange={e => onChange(e.target.value)}
        inputMode="decimal"
      />
      <div style={{ fontSize: 10, color: '#475569', textAlign: 'right' }}>
        1 {ccy} = {Number(rate).toFixed(4)} {acctgCcy}
      </div>
    </div>
  );
}

function VoucherRow({ row, acctgCcy, isSelected, onSelect, onToggle, isSettled }) {
  const netColor  = row.netType === 'gain' ? '#22c55e' : row.netType === 'loss' ? '#ef4444' : '#64748b';
  const ccys      = [...new Set(row.fxLines.map(l => l.originalCurrency))].join(', ');
  const allRealized = row.fxLines.every(l => l.type === 'realized');
  const allUnrealized = row.fxLines.every(l => l.type === 'unrealized');
  const typeLabel = allRealized ? 'Realized' : allUnrealized ? 'Unrealized' : 'Mixed';
  const typeColor = allRealized ? '#22c55e' : allUnrealized ? '#f59e0b' : '#a78bfa';

  return (
    <tr
      onClick={onSelect}
      style={{
        cursor: 'pointer', borderBottom: '1px solid #1e293b',
        background: isSelected ? '#1a1f2e' : 'transparent',
        transition: 'background .1s',
      }}
    >
      <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600, color: '#e2e8f0' }}>{row.voucherId}</td>
      <td style={{ ...S.td, color: '#64748b', fontSize: 11 }}>{row.sheetName}</td>
      <td style={{ ...S.td, color: '#f59e0b', fontFamily: 'monospace', fontSize: 11 }}>{ccys}</td>
      <td style={{ ...S.td, textAlign: 'right', color: '#22c55e', fontFamily: 'monospace' }}>
        {row.totalGain > FX_EPS ? `+${row.totalGain.toFixed(2)}` : '—'}
      </td>
      <td style={{ ...S.td, textAlign: 'right', color: '#ef4444', fontFamily: 'monospace' }}>
        {row.totalLoss < -FX_EPS ? row.totalLoss.toFixed(2) : '—'}
      </td>
      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: netColor, fontFamily: 'monospace' }}>
        {Math.abs(row.netFx) < FX_EPS ? '0.00' : (row.netFx > 0 ? '+' : '') + row.netFx.toFixed(2)}
      </td>
      <td style={{ ...S.td }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: typeColor }}>{typeLabel}</span>
      </td>
      <td style={{ ...S.td, textAlign: 'center' }} onClick={e => { e.stopPropagation(); onToggle(); }}>
        <SettledToggle on={isSettled} />
      </td>
    </tr>
  );
}

function SettledToggle({ on }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
      padding: '3px 8px', borderRadius: 4,
      background: on ? '#052e16' : '#1e293b',
      border: `1px solid ${on ? '#22c55e55' : '#33415533'}`,
    }}>
      <div style={{
        width: 28, height: 14, borderRadius: 999, position: 'relative',
        background: on ? '#22c55e' : '#334155', transition: 'background .2s', flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute', top: 2, width: 10, height: 10, borderRadius: '50%',
          background: '#fff', transition: 'left .2s', left: on ? '16px' : '2px',
        }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color: on ? '#22c55e' : '#475569' }}>
        {on ? 'Settled' : 'Open'}
      </span>
    </div>
  );
}

function VoucherDetail({ voucher, acctgCcy }) {
  const gainAcc = '766';
  const lossAcc = '666';

  return (
    <div style={{ ...S.card, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>{voucher.voucherId}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {voucher.isSettled ? '✓ Settled' : '◌ Open'} ·
            Gain: <span style={{ color: '#22c55e' }}>+{voucher.totalGain.toFixed(2)}</span> ·
            Loss: <span style={{ color: '#ef4444' }}>{voucher.totalLoss.toFixed(2)}</span>
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
          color: voucher.netType === 'gain' ? '#22c55e' : voucher.netType === 'loss' ? '#ef4444' : '#64748b',
          background: voucher.netType === 'gain' ? '#052e16' : voucher.netType === 'loss' ? '#1c0a0a' : '#1e293b',
        }}>
          {voucher.netType === 'gain' ? '+' : ''}{voucher.netFx.toFixed(2)} {acctgCcy}
        </span>
      </div>

      {/* Line-level table */}
      <div style={S.sectionTitle}>Line Detail</div>
      <div style={{ overflowX: 'auto', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={S.thead}>
              <th style={S.th}>Acct</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Amt ({'{CCY}'})</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Orig Rate</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Cur Rate</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Orig {acctgCcy}</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Cur {acctgCcy}</th>
              <th style={{ ...S.th, textAlign: 'right' }}>FX Diff</th>
              <th style={S.th}>Type</th>
              <th style={S.th}>G/L</th>
            </tr>
          </thead>
          <tbody>
            {voucher.fxLines.map((line, i) => {
              const glColor = line.gainOrLoss === 'gain' ? '#22c55e' : line.gainOrLoss === 'loss' ? '#ef4444' : '#64748b';
              return (
                <tr key={i} style={{ borderBottom: '1px solid #1e293b22' }}>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 600 }}>{line.account}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: '#f59e0b', fontFamily: 'monospace' }}>
                    {line.originalAmount.toLocaleString('en')} {line.originalCurrency}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace', color: '#64748b' }}>
                    {line.originalExchangeRate.toFixed(4)}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace', color: '#f59e0b' }}>
                    {line.currentExchangeRate.toFixed(4)}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace', color: '#93c5fd' }}>
                    {line.originalAccountingAmount.toFixed(2)}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace', color: '#a78bfa' }}>
                    {line.currentAccountingAmount.toFixed(2)}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: glColor }}>
                    {line.economicFxDiff > 0 ? '+' : ''}{line.economicFxDiff.toFixed(2)}
                  </td>
                  <td style={{ ...S.td, fontSize: 10, color: line.type === 'realized' ? '#22c55e' : '#f59e0b' }}>
                    {line.type}
                  </td>
                  <td style={{ ...S.td, fontWeight: 700, fontSize: 10, color: glColor }}>
                    {line.gainOrLoss === 'neutral' ? '—' : line.gainOrLoss.toUpperCase()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Journal entry suggestions */}
      {voucher.fxLines.some(l => Math.abs(l.economicFxDiff) >= FX_EPS) && (
        <>
          <div style={S.sectionTitle}>Suggested Journal Entries</div>
          {voucher.fxLines
            .filter(l => Math.abs(l.economicFxDiff) >= FX_EPS)
            .map((line, i) => (
              <JournalSuggestion key={i} line={line} acctgCcy={acctgCcy} gainAcc={gainAcc} lossAcc={lossAcc} />
            ))
          }
        </>
      )}
    </div>
  );
}

function JournalSuggestion({ line, acctgCcy, gainAcc, lossAcc }) {
  const diffAbs  = parseFloat(Math.abs(line.economicFxDiff).toFixed(2));
  const isGain   = line.gainOrLoss === 'gain';
  const fxAcct   = isGain ? gainAcc : lossAcc;
  const fxLabel  = isGain ? 'FX Gain' : 'FX Loss';
  const color    = isGain ? '#22c55e' : '#ef4444';
  const bg       = isGain ? '#05200f' : '#1a0505';
  const label    = `${line.type === 'realized' ? 'Realized' : 'Unrealized'} FX ${line.gainOrLoss} — ${line.originalCurrency} line ${line.account}`;

  const entries = isGain
    ? [
        { side: 'DR', account: line.account, amount: diffAbs, note: 'Revalue asset / receivable' },
        { side: 'CR', account: fxAcct,       amount: diffAbs, note: `${fxLabel} (${line.type})` },
      ]
    : [
        { side: 'DR', account: fxAcct,       amount: diffAbs, note: `${fxLabel} (${line.type})` },
        { side: 'CR', account: line.account, amount: diffAbs, note: 'Revalue liability / payable' },
      ];

  return (
    <div style={{ background: bg, border: `1px solid ${color}33`, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 6 }}>{label}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td style={{ width: 28, fontWeight: 700, color: e.side === 'DR' ? '#93c5fd' : '#86efac', padding: '2px 0' }}>{e.side}</td>
              <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#e2e8f0', width: 70, padding: '2px 0' }}>{e.account}</td>
              <td style={{ fontFamily: 'monospace', color, textAlign: 'right', padding: '2px 0', width: 90 }}>
                {acctgCcy} {diffAbs.toFixed(2)}
              </td>
              <td style={{ color: '#475569', fontSize: 10, paddingLeft: 10, padding: '2px 0 2px 10px' }}>{e.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: 300,
  },
  card: {
    background: '#1a1f2e', border: '1px solid #1e293b',
    borderRadius: 10, overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: '#475569',
    textTransform: 'uppercase', marginBottom: 10,
  },
  thead: {
    borderBottom: '1px solid #334155',
  },
  th: {
    padding: '8px 8px 8px 0', textAlign: 'left', fontSize: 10,
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: .5,
    color: '#475569', background: '#0f172a',
  },
  td: {
    padding: '7px 8px 7px 0', verticalAlign: 'middle', fontSize: 12,
  },
};
