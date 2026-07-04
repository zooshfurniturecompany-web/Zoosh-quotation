import React, { useState } from 'react';
import { currSymbol, fmtNum } from '../utils/currency';

export function extractLocation(address) {
  if (!address) return '—';
  const parts = address.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0];
  
  const skipRegex = /^(house|flat|room|no|floor|bldg|building|near|opp|plot|street|road|p\.?o\.?|post)/i;
  const ignoreList = ['kerala', 'india', 'cochin', 'calicut', 'trivandrum'];
  
  const candidates = parts.filter(p => {
    if (/^\d+$/.test(p)) return false;
    if (skipRegex.test(p)) return false;
    if (ignoreList.includes(p.toLowerCase())) return false;
    return true;
  });
  
  if (candidates.length > 0) {
    return candidates[0];
  }
  
  const firstLine = address.split(/[\n,;]+/)[0].trim();
  return firstLine || '—';
}

export default function Dashboard({
  quotations,
  onNew,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onDownloadPDF,
  onImportJSON,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest'

  // Calculate quote net amount helper
  const calculateTotal = (quote) => {
    const gst = parseFloat(quote.taxPricing?.gst) || 0;
    const disc = parseFloat(quote.taxPricing?.disc) || 0;
    let sub = 0;
    (quote.items || []).forEach((id) => {
      const u = parseFloat(quote.itemData?.[id]?.unit) || 0;
      const q = parseInt(quote.itemData?.[id]?.qty) || 0;
      sub += u * q;
    });
    const discAmt = sub * (disc / 100);
    const taxable = sub - discAmt;
    const gstAmt = taxable * (gst / 100);
    return taxable + gstAmt;
  };

  // Get unique clients for filter list
  const uniqueClients = [...new Set(quotations.map(q => q.client?.name).filter(Boolean))];

  // Search and Filter logic
  const filteredQuotations = quotations
    .filter((quote) => {
      const qNo = (quote.no || '').toLowerCase();
      const clientName = (quote.client?.name || '').toLowerCase();
      const clientPhone = (quote.client?.phone || '').toLowerCase();
      
      const query = searchQuery.toLowerCase();
      const matchQuery =
        qNo.includes(query) ||
        clientName.includes(query) ||
        clientPhone.includes(query) ||
        (quote.items || []).some((id) =>
          (quote.itemData?.[id]?.name || '').toLowerCase().includes(query)
        );

      const matchDate = !dateFilter || quote.date === dateFilter;
      const matchClient = !clientFilter || quote.client?.name === clientFilter;

      return matchQuery && matchDate && matchClient;
    })
    .sort((a, b) => {
      const parseNo = (q) => {
        const seqVal = parseInt(q.sequenceNumber, 10);
        const revVal = parseInt(q.revision, 10);
        if (!isNaN(seqVal) && !isNaN(revVal)) {
          return [seqVal, revVal];
        }
        const match = (q.no || '').match(/^(?:QTN-)?(\d+)(?:-(\d+))?$/i);
        if (match) {
          const seq = parseInt(match[1], 10);
          const rev = match[2] ? parseInt(match[2], 10) : 0;
          return [seq, rev];
        }
        return [0, 0];
      };

      const [seqA, revA] = parseNo(a);
      const [seqB, revB] = parseNo(b);

      if (sortBy === 'newest') {
        if (seqA !== seqB) return seqB - seqA;
        return revB - revA;
      }
      
      if (sortBy === 'oldest') {
        if (seqA !== seqB) return seqA - seqB;
        return revA - revB;
      }
      
      if (sortBy === 'updated') {
        const dateA = new Date(a.updatedAt || a.createdAt || a.date);
        const dateB = new Date(b.updatedAt || b.createdAt || b.date);
        return dateB - dateA;
      }
      
      if (sortBy === 'client-az') {
        const nameA = (a.client?.name || '').toLowerCase();
        const nameB = (b.client?.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      }
      
      if (sortBy === 'client-za') {
        const nameA = (a.client?.name || '').toLowerCase();
        const nameB = (b.client?.name || '').toLowerCase();
        return nameB.localeCompare(nameA);
      }
      
      return 0;
    });

  return (
    <div className="main">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '24px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Completed Quotations
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            className="add-item-btn"
            style={{ background: 'var(--white)', color: 'var(--black)', border: '1px solid var(--black)' }}
            onClick={onImportJSON}
          >
            ⬆ Import JSON
          </button>
          <button className="add-item-btn" onClick={onNew}>
            + New Quotation
          </button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="card" style={{ padding: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          {/* Search bar */}
          <div>
            <span className="lbl">Search</span>
            <input
              type="text"
              className="inp"
              placeholder="Search no., client, phone, product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Date Filter */}
          <div>
            <span className="lbl">Date</span>
            <input
              type="date"
              className="inp"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>

          {/* Client Filter */}
          <div>
            <span className="lbl">Client Name</span>
            <select
              className="inp"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
            >
              <option value="">All Clients</option>
              {uniqueClients.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div>
            <span className="lbl">Sort Order</span>
            <select
              className="inp"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="newest">Newest Quotation First</option>
              <option value="oldest">Oldest Quotation First</option>
              <option value="updated">Last Updated</option>
              <option value="client-az">Client Name (A–Z)</option>
              <option value="client-za">Client Name (Z–A)</option>
            </select>
          </div>
        </div>

        {/* Clear Filters helper */}
        {(searchQuery || dateFilter || clientFilter) && (
          <div style={{ marginTop: '12px', textAlign: 'right' }}>
            <button
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--gray)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                cursor: 'pointer',
                letterSpacing: '0.05em',
              }}
              onClick={() => {
                setSearchQuery('');
                setDateFilter('');
                setClientFilter('');
              }}
            >
              ✕ Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* COMPLETED LIST TABLE */}
      {filteredQuotations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--gray)' }}>
          No quotations found. Click "+ New Quotation" to create one.
        </div>
      ) : (
        <div className="card" style={{ padding: '0', overflowX: 'auto', border: '1px solid var(--black)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr style={{ background: 'var(--near-white)', borderBottom: '1px solid var(--black)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Quotation Number
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Client Name
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Date
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Location
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Total
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Status
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Last Updated
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotations.map((quote) => {
                const total = calculateTotal(quote);
                const updatedStr = quote.updatedAt
                  ? new Date(quote.updatedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
                  : '—';

                return (
                  <tr key={quote.id} style={{ borderBottom: '1px solid var(--border)' }} className="item-row-tr">
                    <td style={{ padding: '14px 16px', fontWeight: 700 }}>{quote.no}</td>
                    <td style={{ padding: '14px 16px' }}>{quote.client?.name || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>{quote.date || '—'}</td>
                    <td style={{ padding: '14px 16px' }}>{extractLocation(quote.client?.addr)}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 700 }}>
                      {currSymbol(quote.curr)}{fmtNum(total)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '3px 8px',
                          border: quote.status === 'Sent' ? '1px solid var(--black)' : '1px solid #ccc',
                          background: quote.status === 'Sent' ? 'var(--black)' : 'transparent',
                          color: quote.status === 'Sent' ? 'var(--white)' : 'var(--gray)',
                        }}
                      >
                        {quote.status || 'Draft'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--gray)' }}>{updatedStr}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <button
                          className="del-btn"
                          style={{ borderColor: 'var(--border)', color: 'var(--black)' }}
                          onClick={() => onView(quote)}
                        >
                          View
                        </button>
                        <button
                          className="del-btn"
                          style={{ borderColor: 'var(--border)', color: 'var(--black)' }}
                          onClick={() => onEdit(quote)}
                        >
                          Edit
                        </button>
                        <button
                          className="del-btn"
                          style={{ borderColor: 'var(--border)', color: 'var(--black)' }}
                          onClick={() => onDuplicate(quote.id)}
                        >
                          Copy
                        </button>
                        <button
                          className="del-btn"
                          style={{ borderColor: 'var(--border)', color: 'var(--black)' }}
                          onClick={() => onDownloadPDF(quote)}
                        >
                          PDF
                        </button>
                        <button
                          className="del-btn"
                          style={{ borderColor: 'rgba(255,100,100,0.3)', color: '#ff5555' }}
                          onClick={() => onDelete(quote.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
