import React from 'react';
import { currSymbol, fmtNum, numberToWords } from '../utils/currency';

export default function QuotationPreview({ quote }) {
  const gst = parseFloat(quote.taxPricing?.gst) || 0;
  const disc = parseFloat(quote.taxPricing?.disc) || 0;
  const sym = currSymbol(quote.curr);
  let sub = 0;

  const items = quote.items || [];
  
  // Calculate Subtotal
  items.forEach(id => {
    const u = parseFloat(quote.itemData[id]?.unit) || 0;
    const q = parseInt(quote.itemData[id]?.qty) || 0;
    sub += u * q;
  });

  const discAmt = sub * (disc / 100);
  const taxable = sub - discAmt;
  const gstAmt = taxable * (gst / 100);
  const net = taxable + gstAmt;

  const notesList = (quote.terms?.text || '')
    .split('\n')
    .filter(t => t.trim());

  const logoHtml = quote.logoData ? (
    <img src={quote.logoData} className="doc-logo-img" alt="Company Logo" />
  ) : (
    <div className="doc-logo-placeholder">{(quote.company?.name || 'LOGO').split(' ')[0]}</div>
  );

  return (
    <div id="quotation-doc">
      {/* HEADER */}
      <div className="doc-header">
        <div className="doc-logo-area">
          {logoHtml}
          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: '14px', fontWeight: 700, color: 'var(--black)', lineHeight: 1.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {quote.company?.name || 'ZOOSH'}
            </div>
            <div className="doc-company">{quote.company?.addr || ''}</div>
            {quote.company?.tag && (
              <div style={{ fontSize: '9px', color: 'var(--gray)', marginTop: '4px', fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                {quote.company.tag}
              </div>
            )}
          </div>
        </div>
        <div className="doc-meta-right">
          <div className="doc-no">Doc. No. : {quote.no || 'QTN'}</div>
          <div className="doc-to">
            To, &nbsp;<strong>{quote.client?.name || '—'}</strong>
            {quote.client?.co && <><br />{quote.client.co}</>}
            <br />Date: {quote.date || ''}
          </div>
          {quote.valid && (
            <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '6px' }}>
              Valid Until: {quote.valid}
            </div>
          )}
        </div>
      </div>

      {/* CONTACT BAR */}
      <div className="doc-contact">
        <span>🌐 {quote.company?.web || ''}</span>
        <span>📞 {quote.company?.phone || ''}</span>
        <span>✉ {quote.company?.email || ''}</span>
      </div>

      {/* TABLE */}
      <table className="doc-table">
        <thead>
          <tr>
            <th>Item Description</th>
            <th>Reference</th>
            <th className="num">Unit ({sym})</th>
            <th className="num">Quantity</th>
            <th style={{ textAlign: 'center' }}>Unit</th>
            <th className="num">Net ({sym})</th>
          </tr>
        </thead>
        <tbody>
          {items.map((id, idx) => {
            const name = quote.itemData[id]?.name || `Item #${idx + 1}`;
            const spec = quote.itemData[id]?.spec || '';
            const unit = parseFloat(quote.itemData[id]?.unit) || 0;
            const qty = parseInt(quote.itemData[id]?.qty) || 0;
            const utype = quote.itemData[id]?.utype || 'nos';
            const line = unit * qty;
            const photo = quote.itemPhotos?.[id];

            return (
              <React.Fragment key={id}>
                <tr className="cat-row">
                  <td colSpan="6">{idx + 1}. &nbsp;{name}</td>
                </tr>
                <tr className="item-row">
                  <td><div className="item-desc-spec">{spec}</div></td>
                  <td className="ref-img-cell">
                    {photo ? (
                      <img src={photo} className="ref-img-thumb" alt={name} />
                    ) : (
                      <div className="ref-img-empty">🪑</div>
                    )}
                  </td>
                  <td className="num-cell">{unit ? fmtNum(unit) : '—'}</td>
                  <td className="num-cell">{qty}</td>
                  <td className="unit-cell">{utype}</td>
                  <td className="num-cell">{line ? fmtNum(line) : '—'}</td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {/* TOTALS */}
      <div className="doc-totals">
        <div className="doc-totals-inner">
          <div className="dt-row">
            <span className="dt-label">TOTAL AMOUNT</span>
            <span className="dt-val">{fmtNum(sub)}</span>
          </div>
          {disc > 0 && (
            <div className="dt-row">
              <span className="dt-label">DISCOUNT ({disc}%)</span>
              <span className="dt-val" style={{ color: 'var(--black)' }}>− {fmtNum(discAmt)}</span>
            </div>
          )}
          <div className="dt-row">
            <span className="dt-label">G.S.T AMOUNT {gst}%</span>
            <span className="dt-val">{fmtNum(gstAmt)}</span>
          </div>
          <div className="dt-row">
            <span className="dt-label">NET AMOUNT</span>
            <span className="dt-val" style={{ color: 'var(--black)', fontWeight: 800 }}>{fmtNum(net)}</span>
          </div>
          <div className="dt-row" style={{ borderTop: '1px dashed var(--border)', background: 'var(--near-white)', padding: '8px 0' }}>
            <span className="dt-label" style={{ fontStyle: 'italic' }}>In Words</span>
            <span className="dt-val" style={{ fontSize: '11px', color: 'var(--near-black)', textAlign: 'right', maxWidth: '220px', lineHeight: 1.4 }}>
              {numberToWords(net)}
            </span>
          </div>
        </div>
      </div>

      {/* TERMS */}
      <div className="doc-terms">
        <div className="doc-terms-title">Terms and Conditions</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--black)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Notes:
            </div>
            <ul>
              {notesList.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </div>
          <div style={{ textAlign: 'right', minWidth: '120px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--black)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {quote.terms?.signName || ''}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>
              {quote.terms?.signDesg || ''}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '6px' }}>Thank you.</div>
          </div>
        </div>
      </div>

      {/* Version History (Hidden on Print) */}
      {quote.history && quote.history.length > 0 && (
        <div className="doc-terms no-print" style={{ borderTop: '1px solid var(--black)', background: '#fff' }}>
          <div className="doc-terms-title">⏳ Version History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {quote.history.map((h, i) => {
              const dateStr = new Date(h.timestamp).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                  <span style={{ fontWeight: 700 }}>Revision {h.revision}</span>
                  <span style={{ color: 'var(--gray)' }}>
                    {h.type === 'created' ? 'Created' : 'Updated'} on {dateStr}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="doc-footer">
        <div className="doc-footer-brand">
          {(quote.company?.name || 'ZOOSH').split(' ').slice(0, 2).join(' ')} <span>|</span>
        </div>
        <div className="doc-footer-sign">
          <strong>{quote.terms?.signName || ''}</strong><br />
          {quote.terms?.signDesg || ''}<br />
          {quote.company?.phone || ''}
        </div>
      </div>
    </div>
  );
}
