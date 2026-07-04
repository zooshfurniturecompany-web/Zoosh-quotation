import { currSymbol, fmtNum, numberToWords } from './currency';

export function downloadPDF(quote) {
  const coName = quote.company?.name || 'ZOOSH';
  const qNo = quote.no || 'QTN';

  // Calculate totals
  const gst = parseFloat(quote.taxPricing?.gst) || 0;
  const disc = parseFloat(quote.taxPricing?.disc) || 0;
  const sym = currSymbol(quote.curr);
  let sub = 0;

  const rows = (quote.items || []).map((id, idx) => {
    const name = quote.itemData[id]?.name || `Item #${idx + 1}`;
    const spec = quote.itemData[id]?.spec || '';
    const unit = parseFloat(quote.itemData[id]?.unit) || 0;
    const qty = parseInt(quote.itemData[id]?.qty) || 0;
    const utype = quote.itemData[id]?.utype || 'nos';
    const line = unit * qty;
    sub += line;
    
    const photo = quote.itemPhotos?.[id];
    const imgHtml = photo
      ? `<img src="${photo}" class="ref-img-thumb">`
      : `<div class="ref-img-empty">🪑</div>`;
      
    return `
      <tr class="cat-row"><td colspan="6">${idx + 1}. &nbsp;${name}</td></tr>
      <tr class="item-row">
        <td><div class="item-desc-spec">${spec}</div></td>
        <td class="ref-img-cell">${imgHtml}</td>
        <td class="num-cell">${unit ? fmtNum(unit) : '—'}</td>
        <td class="num-cell">${qty}</td>
        <td class="unit-cell">${utype}</td>
        <td class="num-cell">${line ? fmtNum(line) : '—'}</td>
      </tr>`;
  }).join('');

  const discAmt = sub * (disc / 100);
  const taxable = sub - discAmt;
  const gstAmt = taxable * (gst / 100);
  const net = taxable + gstAmt;

  const termsHtml = (quote.terms?.text || '')
    .split('\n')
    .filter(t => t.trim())
    .map(t => `<li>${t.trim()}</li>`)
    .join('');

  const logoHtml = quote.logoData
    ? `<img src="${quote.logoData}" class="doc-logo-img">`
    : `<div class="doc-logo-placeholder">${(quote.company?.name || 'LOGO').split(' ')[0]}</div>`;

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${qNo} — ${coName}</title>
    <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      :root{
        --dark:#111111;
        --gold:#000000;
        --light:#f9f9f9;
        --border:#e0e0e0;
        --muted:#666666;
        --font-serif: 'Granjon', 'EB Garamond', Garamond, serif;
        --font-sans: 'Inter', sans-serif;
      }
      body{font-family:var(--font-sans);font-size:10pt;color:#111111;background:#fff;}
      .wrap{max-width:860px;margin:0 auto;padding:0;}
      .doc-header{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 28px 16px;border-bottom:1px solid #111111;}
      .doc-logo-img{height:52px;max-width:130px;object-fit:contain;filter:grayscale(100%);}
      .doc-logo-placeholder{font-family:var(--font-serif);font-size:30px;font-weight:700;letter-spacing:.1em;color:#111111;}
      .doc-company{font-size:9px;color:var(--muted);line-height:1.7;margin-top:3px;}
      .doc-meta-right{text-align:right;}
      .doc-no{font-size:10px;color:#111111;font-weight:700;letter-spacing:.05em;text-transform:uppercase;}
      .doc-to{font-size:11px;color:#111111;margin-top:5px;line-height:1.7;}
      .doc-contact{background:#f9f9f9;color:#111111;display:flex;justify-content:space-around;padding:8px 28px;font-size:9px;letter-spacing:.04em;text-transform:uppercase;border-bottom:1px solid #111111;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      table{width:100%;border-collapse:collapse;}
      thead tr th{background:#f9f9f9;padding:7px 12px;font-size:8px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#111111;border-bottom:1px solid #111111;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      thead tr th.num{text-align:right;}
      .cat-row td{background:#f9f9f9;color:#111111;padding:10px 12px 6px;font-family:var(--font-serif);font-size:10pt;font-weight:700;letter-spacing:.05em;text-transform:uppercase;border-bottom:1px solid #111111;border-top:1px solid #eee;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .item-row td{padding:11px 12px;border-bottom:1px solid #eee;vertical-align:top;}
      .item-row:nth-child(even) td{background:#f9f9f9;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .ref-img-thumb{max-width:68px;max-height:85px;width:auto;height:auto;object-fit:contain;border-radius:0;border:1px solid #e0e0e0;display:block;background:#fff;}
      .ref-img-empty{width:68px;height:68px;background:#f9f9f9;border-radius:0;display:inline-flex;align-items:center;justify-content:center;font-size:18px;color:#ccc;border:1px solid #e0e0e0;}
      .item-desc-spec{font-size:9px;color:#333;line-height:1.6;}
      .num-cell{text-align:right;font-size:11px;font-weight:700;color:#111111;white-space:nowrap;}
      .unit-cell{text-align:center;font-size:10px;color:var(--muted);}
      .doc-totals{padding:12px 28px;display:flex;justify-content:flex-end;border-top:1px solid #111111;}
      .doc-totals-inner{min-width:240px;}
      .dt-row{display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid #eee;}
      .dt-row:nth-last-child(2){border-bottom:none;border-top:1px solid #111111;margin-top:4px;padding-top:8px;font-family:var(--font-serif);font-size:15px;font-weight:700;}
      .dt-row:nth-last-child(2) .dt-val{color:#111111;}
      .dt-row:last-child{border-bottom:none;border-top:1px dashed #e0e0e0;background:#f9f9f9;padding:6px 0;}
      .dt-row:last-child .dt-label{font-style:italic;}
      .dt-row:last-child .dt-val{font-size:9px;font-weight:400;text-align:right;max-width:200px;line-height:1.4;color:#111111;}
      .dt-label{color:var(--muted);}
      .dt-val{font-weight:700;}
      .doc-terms{padding:16px 28px;border-top:1px solid #e0e0e0;background:#f9f9f9;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .doc-terms ul{list-style:none;padding:0;}
      .doc-terms ul li{font-size:9px;color:#444;padding:2px 0 2px 12px;position:relative;line-height:1.5;}
      .doc-terms ul li:before{content:"—";position:absolute;left:0;color:#111111;}
      .doc-footer{background:#f9f9f9;color:#111111;padding:12px 28px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #111111;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .doc-footer-brand{font-family:var(--font-serif);font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#111111;}
      .doc-footer-sign{text-align:right;font-size:10px;color:#444;line-height:1.6;}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
    </style>
  </head><body><div class="wrap">
    <!-- HEADER -->
    <div class="doc-header">
      <div class="doc-logo-area">
        ${logoHtml}
        <div>
          <div style="font-family:var(--font-serif);font-size:14px;font-weight:700;color:var(--black);line-height:1.5;text-transform:uppercase;letter-spacing:0.05em;">${quote.company?.name || 'ZOOSH'}</div>
          <div class="doc-company">${quote.company?.addr || ''}</div>
          ${quote.company?.tag ? `<div style="font-size:9px;color:var(--muted);margin-top:4px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;">${quote.company.tag}</div>` : ''}
        </div>
      </div>
      <div class="doc-meta-right">
        <div class="doc-no">Doc. No. : ${qNo}</div>
        <div class="doc-to">To, &nbsp;<strong>${quote.client?.name || '—'}</strong>${quote.client?.co ? '<br>' + quote.client.co : ''}<br>Date: ${quote.date || ''}</div>
        ${quote.valid ? `<div style="font-size:11px;color:var(--muted);margin-top:6px;">Valid Until: ${quote.valid}</div>` : ''}
      </div>
    </div>

    <!-- CONTACT BAR -->
    <div class="doc-contact">
      <span>🌐 ${quote.company?.web || ''}</span>
      <span>📞 ${quote.company?.phone || ''}</span>
      <span>✉ ${quote.company?.email || ''}</span>
    </div>

    <!-- TABLE -->
    <table class="doc-table">
      <thead>
        <tr>
          <th>Item Description</th>
          <th>Reference</th>
          <th class="num">Unit (${sym})</th>
          <th class="num">Quantity</th>
          <th style="text-align:center;">Unit</th>
          <th class="num">Net (${sym})</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- TOTALS -->
    <div class="doc-totals">
      <div class="doc-totals-inner">
        <div class="dt-row"><span class="dt-label">TOTAL AMOUNT</span><span class="dt-val">${fmtNum(sub)}</span></div>
        ${disc > 0 ? `<div class="dt-row"><span class="dt-label">DISCOUNT (${disc}%)</span><span class="dt-val" style="color:#111111;">− ${fmtNum(discAmt)}</span></div>` : ''}
        <div class="dt-row"><span class="dt-label">G.S.T AMOUNT ${gst}%</span><span class="dt-val">${fmtNum(gstAmt)}</span></div>
        <div class="dt-row"><span class="dt-label">NET AMOUNT</span><span class="dt-val" style="color:#111111; font-weight:800;">${fmtNum(net)}</span></div>
        <div class="dt-row" style="border-top:1px dashed #e0e0e0;background:#f9f9f9;padding:8px 0;"><span class="dt-label" style="font-style:italic;">In Words</span><span class="dt-val" style="font-size:9px;color:#111111;text-align:right;max-width:220px;line-height:1.4;">${numberToWords(net)}</span></div>
      </div>
    </div>

    <!-- TERMS -->
    <div class="doc-terms">
      <div class="doc-terms-title">Terms and Conditions</div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div style="flex:1;min-width:220px;">
          <div style="font-size:9px;font-weight:700;color:#111111;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;">Notes:</div>
          <ul>${termsHtml}</ul>
        </div>
        <div style="text-align:right;min-width:120px;">
          <div style="font-size:11px;font-weight:700;color:#111111;text-transform:uppercase;letter-spacing:0.05em;">${quote.terms?.signName || ''}</div>
          <div style="font-size:9px;color:#666666;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">${quote.terms?.signDesg || ''}</div>
          <div style="font-size:9px;color:#666666;margin-top:6px;">Thank you.</div>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="doc-footer">
      <div class="doc-footer-brand">${(quote.company?.name || 'ZOOSH').split(' ').slice(0, 2).join(' ')} <span>|</span></div>
      <div class="doc-footer-sign">
        <strong>${quote.terms?.signName || ''}</strong><br>
        ${quote.terms?.signDesg || ''}<br>
        ${quote.company?.phone || ''}
      </div>
    </div>
  </div></body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 800);
}
