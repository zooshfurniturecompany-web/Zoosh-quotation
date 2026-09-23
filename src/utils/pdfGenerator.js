import { currSymbol, fmtNum, numberToWords } from './currency';
import { DEFAULT_ZOOSH_LOGO } from './logo';

function getSanitizedFilename(quote, isBranded = true) {
  const clientName = quote.client?.name || 'Client';
  const qNo = quote.no || 'QTN';
  
  // Sanitize client name: remove / \ : * ? " < > | and . (periods)
  const cleanClientName = clientName
    .replace(/[\/\\:\*\?"<>\|]/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
    
  const suffix = isBranded ? '' : ' (Unbranded)';
  return `${cleanClientName} - ${qNo}${suffix}`;
}

export function downloadPDF(quote, options = { branded: true }) {
  const isBranded = options?.branded !== false;
  const qNo = quote.no || 'QTN';

  // Calculate totals
  const isGstRemoved = Boolean(quote.taxPricing?.removeGst) || 
    (quote.taxPricing?.gst !== undefined && quote.taxPricing?.gst !== '' && parseFloat(quote.taxPricing?.gst) === 0);
  const gst = isGstRemoved ? 0 : (parseFloat(quote.taxPricing?.gst) || 0);
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
  const gstAmt = isGstRemoved ? 0 : taxable * (gst / 100);
  const net = taxable + gstAmt;

  const termsHtml = (quote.terms?.text || '')
    .split('\n')
    .filter(t => t.trim())
    .map(t => `<li>${t.trim()}</li>`)
    .join('');

  const logoSrc = isBranded ? (quote.logoData || DEFAULT_ZOOSH_LOGO) : null;
  const logoImgHtml = logoSrc ? `<img src="${logoSrc}" class="doc-logo-img" alt="Logo">` : '';

  const headerHtml = isBranded
    ? `
      <div class="doc-header">
        <div class="doc-logo-area">
          ${logoImgHtml}
          <div>
            <div class="doc-company-name">${quote.company?.name || 'ZOOSH'}</div>
            <div class="doc-company-address">${quote.company?.addr || 'Palakkad, Kerala, India'}</div>
            ${quote.company?.tag ? `<div class="doc-company-tag">${quote.company.tag}</div>` : '<div class="doc-company-tag">Custom Furniture Company</div>'}
          </div>
        </div>
        <div class="doc-meta-right">
          <div class="doc-no">Doc. No. : ${qNo}</div>
          <div class="doc-to">To, &nbsp;<strong>${quote.client?.name || '—'}</strong>${quote.client?.co ? '<br>' + quote.client.co : ''}<br>Date: ${quote.date || ''}</div>
          ${quote.valid ? `<div style="font-size:11px;color:var(--muted);margin-top:6px;">Valid Until: ${quote.valid}</div>` : ''}
        </div>
      </div>
      <div class="doc-contact">
        <span>🌐 ${quote.company?.web || 'www.zoosh.in'}</span>
        <span>📞 ${quote.company?.phone || '+91 9567193992'}</span>
        <span>✉ ${quote.company?.email || 'zooshfurniturecompany@gmail.com'}</span>
      </div>
    `
    : `
      <div class="doc-header">
        <div class="doc-company-info">
          <div class="doc-company-address">${quote.company?.addr || 'Palakkad, Kerala, India'}</div>
        </div>
        <div class="doc-meta-right">
          <div class="doc-no">Doc. No. : ${qNo}</div>
          <div class="doc-to">To, &nbsp;<strong>${quote.client?.name || '—'}</strong>${quote.client?.co ? '<br>' + quote.client.co : ''}<br>Date: ${quote.date || ''}</div>
          ${quote.valid ? `<div style="font-size:11px;color:var(--muted);margin-top:6px;">Valid Until: ${quote.valid}</div>` : ''}
        </div>
      </div>
    `;

  const footerBrand = isBranded
    ? `${(quote.company?.name || 'ZOOSH').split(' ').slice(0, 2).join(' ')} <span>|</span>`
    : `QUOTATION <span>|</span>`;

  const footerSignName = isBranded ? (quote.terms?.signName || 'LISHA') : (quote.terms?.signName || '');
  const footerSignDesg = isBranded ? (quote.terms?.signDesg || 'Administrator') : (quote.terms?.signDesg || '');
  const footerPhone = (quote.company?.phone && (isBranded || !quote.company.phone.toLowerCase().includes('zoosh'))) ? quote.company.phone : '';

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${getSanitizedFilename(quote, isBranded)}</title>
    <link href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      :root{
        --black:#111111;
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
      .doc-header{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 28px 20px;border-bottom:1px solid #111111;}
      .doc-logo-area{display:flex;align-items:center;gap:16px;}
      .doc-logo-img{height:52px;max-width:140px;object-fit:contain;}
      .doc-company-info{max-width:340px;}
      .doc-company-name{font-family:var(--font-serif);font-size:14px;font-weight:700;color:var(--black);line-height:1.5;text-transform:uppercase;letter-spacing:0.05em;}
      .doc-company-tag{font-size:9px;color:var(--muted);margin-top:4px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;}
      .doc-company-address{font-size:11px;color:#111111;line-height:1.6;font-weight:500;}
      .doc-meta-right{text-align:right;}
      .doc-no{font-size:10px;color:#111111;font-weight:700;letter-spacing:.05em;text-transform:uppercase;}
      .doc-to{font-size:11px;color:#111111;margin-top:5px;line-height:1.7;}
      .doc-contact{background:#f9f9f9;color:#111111;display:flex;justify-content:space-around;padding:8px 28px;font-size:9px;letter-spacing:.04em;text-transform:uppercase;border-bottom:1px solid #111111;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      table{width:100%;border-collapse:collapse;}
      thead tr th{background:#f9f9f9;padding:7px 12px;font-size:8px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#111111;border-bottom:1px solid #111111;text-align:left;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      thead tr th.num{text-align:right;}
      .cat-row td{background:#f9f9f9;color:#111111;padding:10px 12px 6px;font-family:var(--font-serif);font-size:10pt;font-weight:700;letter-spacing:.05em;border-bottom:1px solid #111111;border-top:1px solid #eee;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .cat-row{page-break-after:avoid;break-after:avoid;}
      .item-row td{padding:11px 12px;border-bottom:1px solid #eee;vertical-align:top;}
      .item-row{page-break-inside:avoid;break-inside:avoid;}
      .item-row:nth-child(even) td{background:#f9f9f9;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      .ref-img-cell{width:170px;}
      .ref-img-thumb{width:150px;height:112px;object-fit:contain;border-radius:4px;border:1px solid #e0e0e0;display:block;background:#fff;}
      .ref-img-empty{width:150px;height:112px;background:#f9f9f9;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;font-size:20px;color:#ccc;border:1px solid #e0e0e0;}
      .item-desc-spec{font-size:9px;color:#333;line-height:1.6;}
      .num-cell{text-align:right;font-size:11px;font-weight:700;color:#111111;white-space:nowrap;}
      .unit-cell{text-align:center;font-size:10px;color:var(--muted);}
      .doc-totals{padding:12px 28px;display:flex;justify-content:flex-end;border-top:1px solid #111111;}
      .doc-totals-inner{min-width:240px;}
      .dt-row{display:flex;justify-content:space-between;padding:5px 0;font-size:11px;border-bottom:1px solid #eee;}
      .dt-row:nth-last-child(2), .dt-row.net-row{border-bottom:none;border-top:1px solid #111111;margin-top:4px;padding-top:8px;font-family:var(--font-serif);font-size:15px;font-weight:700;}
      .dt-row:nth-last-child(2) .dt-val, .dt-row.net-row .dt-val{color:#111111;}
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
    ${headerHtml}

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
        ${!isGstRemoved ? `<div class="dt-row"><span class="dt-label">G.S.T AMOUNT ${gst}%</span><span class="dt-val">${fmtNum(gstAmt)}</span></div>` : ''}
        <div class="dt-row net-row">
          <div style="display:flex;flex-direction:column;align-items:flex-start;">
            <span class="dt-label" style="color:#111111;">NET AMOUNT${isGstRemoved ? ' (GST EXCLUDED)' : ''}</span>
            ${isGstRemoved ? `<span style="font-size:8.5px;color:#555555;font-style:italic;font-family:var(--font-sans);font-weight:400;text-transform:none;letter-spacing:0;margin-top:2px;">Total amount is the price which is GST excluded</span>` : ''}
          </div>
          <span class="dt-val" style="color:#111111; font-weight:800;">${fmtNum(net)}</span>
        </div>
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
      <div class="doc-footer-brand">${footerBrand}</div>
      <div class="doc-footer-sign">
        <strong>${footerSignName}</strong><br>
        ${footerSignDesg}<br>
        ${footerPhone}
      </div>
    </div>
  </div></body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 800);
}
