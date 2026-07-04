import React, { useState, useEffect } from 'react';
import ProductItem from './ProductItem';
import CropModal from './CropModal';
import { currSymbol, fmtNum, numberToWords } from '../utils/currency';

export default function QuotationForm({ initialQuote, onSave, onCancel }) {
  const [quote, setQuote] = useState(initialQuote);
  const [cropState, setCropState] = useState({ itemId: null, src: null });
  const [itemCounter, setItemCounter] = useState(0);

  // Initialize item counter on load
  useEffect(() => {
    if (quote.items && quote.items.length > 0) {
      const maxId = Math.max(...quote.items.map(Number));
      setItemCounter(maxId);
    } else {
      setItemCounter(0);
    }
  }, [initialQuote]);

  // Company logo upload
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setQuote((prev) => ({ ...prev, logoData: event.target.result }));
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // Company details updates
  const handleCompanyChange = (field, val) => {
    setQuote((prev) => ({
      ...prev,
      company: { ...prev.company, [field]: val },
    }));
  };

  // Client details updates
  const handleClientChange = (field, val) => {
    setQuote((prev) => ({
      ...prev,
      client: { ...prev.client, [field]: val },
    }));
  };

  // Quote metadata updates
  const handleMetaChange = (field, val) => {
    setQuote((prev) => ({ ...prev, [field]: val }));
  };

  // Terms and signature changes
  const handleTermsChange = (field, val) => {
    setQuote((prev) => ({
      ...prev,
      terms: { ...prev.terms, [field]: val },
    }));
  };

  // Line item field updates
  const handleItemFieldChange = (itemId, field, val) => {
    setQuote((prev) => ({
      ...prev,
      itemData: {
        ...prev.itemData,
        [itemId]: { ...prev.itemData[itemId], [field]: val },
      },
    }));
  };

  // Line item auto-fill changes
  const handleItemAutoFillChange = (itemId, afStateVal) => {
    setQuote((prev) => ({
      ...prev,
      afState: { ...prev.afState, [itemId]: afStateVal },
    }));
  };

  // Add a line item
  const handleAddItem = () => {
    const nextId = itemCounter + 1;
    setItemCounter(nextId);
    
    setQuote((prev) => {
      const newItems = [...(prev.items || []), nextId];
      const newItemData = {
        ...prev.itemData,
        [nextId]: { name: '', spec: '', unit: '', qty: '1', utype: 'nos' },
      };
      return { ...prev, items: newItems, itemData: newItemData };
    });
  };

  // Remove a line item
  const handleRemoveItem = (itemId) => {
    setQuote((prev) => {
      const newItems = (prev.items || []).filter((id) => id !== itemId);
      const newItemData = { ...prev.itemData };
      delete newItemData[itemId];
      const newItemPhotos = { ...prev.itemPhotos };
      delete newItemPhotos[itemId];
      const newAfState = { ...prev.afState };
      delete newAfState[itemId];

      return {
        ...prev,
        items: newItems,
        itemData: newItemData,
        itemPhotos: newItemPhotos,
        afState: newAfState,
      };
    });
  };

  // Trigger crop modal on image select
  const handleItemImageSelect = (itemId, src) => {
    setCropState({ itemId, src });
  };

  // Apply cropped image
  const handleApplyCrop = (croppedDataUrl) => {
    if (cropState.itemId) {
      setQuote((prev) => ({
        ...prev,
        itemPhotos: { ...prev.itemPhotos, [cropState.itemId]: croppedDataUrl },
      }));
    }
    setCropState({ itemId: null, src: null });
  };

  // Totals calculations
  const calculateTotals = () => {
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
    const net = taxable + gstAmt;

    return { sub, discAmt, gstAmt, net };
  };

  const { sub, discAmt, gstAmt, net } = calculateTotals();
  const sym = currSymbol(quote.curr);

  // Submit Quote changes
  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(quote);
  };

  return (
    <form className="main" onSubmit={handleSubmit}>
      {/* File Action Nav */}
      <div className="card" style={{ borderColor: 'var(--black)', background: 'var(--near-white)', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '16px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {quote.id ? '✏ Edit Quotation' : '✦ New Quotation'}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="nav-btn outline" type="button" style={{ color: 'var(--black)', borderColor: 'var(--black)' }} onClick={onCancel}>
              Cancel
            </button>
            <button className="nav-btn gold" type="submit" style={{ background: 'var(--black)', color: 'var(--white)', border: '1px solid var(--black)' }}>
              {quote.id ? 'Update Quotation' : 'Save Quotation'}
            </button>
          </div>
        </div>
      </div>

      {/* Company Section */}
      <div className="card">
        <div className="card-title">🏢 Your Company Details</div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <span className="lbl">Company Logo</span>
            <div className="logo-uploader" onClick={() => document.getElementById('logo-file-input').click()}>
              {quote.logoData ? (
                <img src={quote.logoData} alt="Logo preview" />
              ) : (
                <>
                  <div className="up-icon">🏭</div>
                  <div className="up-txt">Upload Logo</div>
                </>
              )}
            </div>
            <input
              type="file"
              id="logo-file-input"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleLogoUpload}
            />
          </div>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <div className="g2" style={{ marginBottom: '10px' }}>
              <div>
                <span className="lbl">Company / Brand Name</span>
                <input
                  className="inp"
                  value={quote.company?.name || ''}
                  onChange={(e) => handleCompanyChange('name', e.target.value)}
                />
              </div>
              <div>
                <span className="lbl">Tagline / Type</span>
                <input
                  className="inp"
                  value={quote.company?.tag || ''}
                  onChange={(e) => handleCompanyChange('tag', e.target.value)}
                />
              </div>
            </div>
            <div className="g3">
              <div>
                <span className="lbl">Address</span>
                <input
                  className="inp"
                  value={quote.company?.addr || ''}
                  onChange={(e) => handleCompanyChange('addr', e.target.value)}
                />
              </div>
              <div>
                <span className="lbl">Phone</span>
                <input
                  className="inp"
                  value={quote.company?.phone || ''}
                  onChange={(e) => handleCompanyChange('phone', e.target.value)}
                />
              </div>
              <div>
                <span className="lbl">Email</span>
                <input
                  className="inp"
                  value={quote.company?.email || ''}
                  onChange={(e) => handleCompanyChange('email', e.target.value)}
                />
              </div>
            </div>
            <div style={{ marginTop: '10px' }}>
              <span className="lbl">Website</span>
              <input
                className="inp"
                value={quote.company?.web || ''}
                onChange={(e) => handleCompanyChange('web', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quote Info Section */}
      <div className="card">
        <div className="card-title">📋 Quotation Info</div>
        <div className="g4">
          <div>
            <span className="lbl">Doc No.</span>
            <input
              className="inp"
              value={quote.no || ''}
              onChange={(e) => handleMetaChange('no', e.target.value)}
              readOnly={!quote.id}
              style={!quote.id ? { background: 'var(--near-white)', color: 'var(--gray)', cursor: 'not-allowed' } : {}}
            />
          </div>
          <div>
            <span className="lbl">Date</span>
            <input
              className="inp"
              type="date"
              value={quote.date || ''}
              onChange={(e) => handleMetaChange('date', e.target.value)}
            />
          </div>
          <div>
            <span className="lbl">Valid Until</span>
            <input
              className="inp"
              type="date"
              value={quote.valid || ''}
              onChange={(e) => handleMetaChange('valid', e.target.value)}
            />
          </div>
          <div>
            <span className="lbl">Currency</span>
            <select
              className="inp"
              value={quote.curr || 'INR'}
              onChange={(e) => handleMetaChange('curr', e.target.value)}
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: '12px' }}>
          <span className="lbl">Quotation Status</span>
          <select
            className="inp"
            style={{ maxWidth: '200px' }}
            value={quote.status || 'Draft'}
            onChange={(e) => handleMetaChange('status', e.target.value)}
          >
            <option value="Draft">Draft</option>
            <option value="Sent">Sent</option>
          </select>
        </div>
      </div>

      {/* Version History Section */}
      {quote.history && quote.history.length > 0 && (
        <div className="card">
          <div className="card-title">⏳ Version History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {quote.history.map((h, i) => {
              const dateStr = new Date(h.timestamp).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--near-white)',
                    borderLeft: i === quote.history.length - 1 ? '3px solid var(--black)' : '1px solid var(--border)',
                    fontSize: '13px',
                  }}
                >
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

      {/* Client Section */}
      <div className="card">
        <div className="card-title">👤 Client Details</div>
        <div className="g3">
          <div>
            <span className="lbl">Client Name</span>
            <input
              className="inp"
              value={quote.client?.name || ''}
              placeholder="Client name"
              onChange={(e) => handleClientChange('name', e.target.value)}
            />
          </div>
          <div>
            <span className="lbl">Company (optional)</span>
            <input
              className="inp"
              value={quote.client?.co || ''}
              placeholder="Client company"
              onChange={(e) => handleClientChange('co', e.target.value)}
            />
          </div>
          <div>
            <span className="lbl">Phone</span>
            <input
              className="inp"
              value={quote.client?.phone || ''}
              placeholder="+91 XXXXX XXXXX"
              onChange={(e) => handleClientChange('phone', e.target.value)}
            />
          </div>
          <div className="span2">
            <span className="lbl">Address</span>
            <input
              className="inp"
              value={quote.client?.addr || ''}
              placeholder="Client address"
              onChange={(e) => handleClientChange('addr', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Products list Section */}
      <div className="card">
        <div className="card-title">🪑 Products / Line Items</div>
        <div id="items-container">
          {(quote.items || []).map((id, index) => (
            <ProductItem
              key={id}
              id={id}
              index={index}
              itemData={quote.itemData[id] || {}}
              photo={quote.itemPhotos?.[id]}
              afState={quote.afState?.[id]}
              currency={quote.curr}
              onUpdateField={handleItemFieldChange}
              onUpdateAutoFill={handleItemAutoFillChange}
              onImageUpload={handleItemImageSelect}
              onRemove={handleRemoveItem}
            />
          ))}
        </div>
        <button className="add-item-btn" type="button" onClick={handleAddItem}>
          + Add Product Item
        </button>
      </div>

      {/* Pricing and tax Section */}
      <div className="card">
        <div className="card-title">💰 Tax & Pricing</div>
        <div className="g3" style={{ marginBottom: '18px' }}>
          <div>
            <span className="lbl">GST / Tax (%)</span>
            <input
              className="inp"
              type="number"
              value={quote.taxPricing?.gst || '18'}
              min="0"
              max="100"
              onChange={(e) =>
                setQuote((prev) => ({
                  ...prev,
                  taxPricing: { ...prev.taxPricing, gst: e.target.value },
                }))
              }
            />
          </div>
          <div>
            <span className="lbl">Discount (%)</span>
            <input
              className="inp"
              type="number"
              value={quote.taxPricing?.disc || '0'}
              min="0"
              max="100"
              onChange={(e) =>
                setQuote((prev) => ({
                  ...prev,
                  taxPricing: { ...prev.taxPricing, disc: e.target.value },
                }))
              }
            />
          </div>
        </div>
        <div className="totals-wrap">
          <div className="totals-box">
            <div className="t-row">
              <span className="t-label">Subtotal</span>
              <span className="t-val">{sym}{fmtNum(sub)}</span>
            </div>
            {parseFloat(quote.taxPricing?.disc) > 0 && (
              <div className="t-row">
                <span className="t-label">Discount ({quote.taxPricing.disc}%)</span>
                <span className="t-disc">− {sym}{fmtNum(discAmt)}</span>
              </div>
            )}
            <div className="t-row">
              <span className="t-label">GST / Tax ({quote.taxPricing?.gst || 0}%)</span>
              <span className="t-val">{sym}{fmtNum(gstAmt)}</span>
            </div>
            <div className="t-row">
              <span className="t-label">Net Amount</span>
              <span className="t-val" style={{ color: 'var(--black)', fontSize: '16px', fontWeight: 800 }}>
                {sym}{fmtNum(net)}
              </span>
            </div>
            <div className="t-row" style={{ borderTop: '1px dashed var(--border)', background: 'var(--near-white)' }}>
              <span className="t-label" style={{ fontStyle: 'italic' }}>In Words</span>
              <span className="t-val" style={{ fontSize: '11px', color: 'var(--near-black)', textAlign: 'right', maxWidth: '200px', lineHeight: 1.4 }}>
                {numberToWords(net)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Terms and designations Section */}
      <div className="card">
        <div className="card-title">📝 Terms & Conditions</div>
        <div style={{ marginBottom: '10px' }}>
          <span className="lbl">Authorized By / Signature Name</span>
          <input
            className="inp"
            value={quote.terms?.signName || ''}
            style={{ maxWidth: '240px' }}
            onChange={(e) => handleTermsChange('signName', e.target.value)}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <span className="lbl">Designation</span>
          <input
            className="inp"
            value={quote.terms?.signDesg || ''}
            style={{ maxWidth: '240px' }}
            onChange={(e) => handleTermsChange('signDesg', e.target.value)}
          />
        </div>
        <div>
          <span className="lbl">Terms (one per line)</span>
          <textarea
            className="inp"
            rows="8"
            value={quote.terms?.text || ''}
            onChange={(e) => handleTermsChange('text', e.target.value)}
          />
        </div>
      </div>

      {/* Save Button */}
      <div style={{ textAlign: 'center', paddingBottom: '30px' }}>
        <button
          className="nav-btn gold"
          type="submit"
          style={{ padding: '13px 44px', fontSize: '14px', borderRadius: 0, background: 'var(--black)', color: 'var(--white)', border: '1px solid var(--black)' }}
        >
          {quote.id ? 'Update Quotation' : 'Save Quotation'}
        </button>
      </div>

      {/* Image Crop Modal Overlay */}
      {cropState.src && (
        <CropModal
          imageSrc={cropState.src}
          onApply={handleApplyCrop}
          onClose={() => setCropState({ itemId: null, src: null })}
        />
      )}
    </form>
  );
}
