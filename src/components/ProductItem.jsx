import React, { useState } from 'react';
import { AF_DATA, AF_STRUCTURE_KEYS, generateDescription } from '../utils/autofill';
import { currSymbol, fmtNum } from '../utils/currency';

export default function ProductItem({
  id,
  index,
  itemData,
  photo,
  afState,
  currency,
  onUpdateField,
  onUpdateAutoFill,
  onImageUpload,
  onRemove,
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onImageUpload(id, event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        onImageUpload(id, event.target.result);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const getAfState = () => {
    return afState || {
      selections: {},
      upholstery: [],
      rope: [],
      cane: [],
      finishes: [],
    };
  };

  const currentAf = getAfState();

  const toggleStructure = (struct) => {
    const newSelections = { ...(currentAf.selections || {}) };
    if (newSelections[struct]) {
      delete newSelections[struct];
    } else {
      newSelections[struct] = { subtypes: [] };
    }
    
    // Recalculate finishes: keep only those valid for remaining structures
    const validFinishes = new Set();
    Object.keys(newSelections).forEach(key => {
      (AF_DATA[key]?.finishes || []).forEach(f => validFinishes.add(f));
    });
    const newFinishes = (currentAf.finishes || []).filter(f => validFinishes.has(f));

    onUpdateAutoFill(id, {
      ...currentAf,
      selections: newSelections,
      finishes: newFinishes,
    });
  };

  const toggleSubtype = (struct, sub) => {
    const newSelections = { ...(currentAf.selections || {}) };
    if (!newSelections[struct]) return;

    let newSubs = [...(newSelections[struct].subtypes || [])];
    if (newSubs.includes(sub)) {
      newSubs = newSubs.filter(s => s !== sub);
    } else {
      newSubs.push(sub);
    }

    newSelections[struct] = { ...newSelections[struct], subtypes: newSubs };
    onUpdateAutoFill(id, { ...currentAf, selections: newSelections });
  };

  const toggleUph = (opt) => {
    let newUph = [...(currentAf.upholstery || [])];
    if (newUph.includes(opt)) {
      newUph = newUph.filter(x => x !== opt);
    } else {
      newUph.push(opt);
    }
    onUpdateAutoFill(id, { ...currentAf, upholstery: newUph });
  };

  const toggleRope = (opt) => {
    let newRope = [...(currentAf.rope || [])];
    if (newRope.includes(opt)) {
      newRope = newRope.filter(x => x !== opt);
    } else {
      newRope.push(opt);
    }
    onUpdateAutoFill(id, { ...currentAf, rope: newRope });
  };

  const toggleCane = (opt) => {
    let newCane = [...(currentAf.cane || [])];
    if (newCane.includes(opt)) {
      newCane = newCane.filter(x => x !== opt);
    } else {
      newCane.push(opt);
    }
    onUpdateAutoFill(id, { ...currentAf, cane: newCane });
  };

  const toggleFinish = (finish) => {
    let newFinishes = [...(currentAf.finishes || [])];
    if (newFinishes.includes(finish)) {
      newFinishes = newFinishes.filter(x => x !== finish);
    } else {
      newFinishes.push(finish);
    }
    onUpdateAutoFill(id, { ...currentAf, finishes: newFinishes });
  };

  const handleGenerate = () => {
    const desc = generateDescription(itemData.name, currentAf);
    if (desc) {
      onUpdateField(id, 'spec', desc);
    } else {
      alert('Please select at least one Structure option.');
    }
  };

  // Determine which sections to show
  const showSubsections = Object.keys(currentAf.selections || {}).length > 0;
  
  // Compile all available finishes for active structures
  const availableFinishes = new Set();
  Object.keys(currentAf.selections || {}).forEach(key => {
    (AF_DATA[key]?.finishes || []).forEach(f => availableFinishes.add(f));
  });

  const price = parseFloat(itemData.unit) || 0;
  const qty = parseInt(itemData.qty) || 0;
  const lineTotal = price * qty;

  return (
    <div className="item-wrap">
      <div className="item-hdr">
        <div className="item-hdr-left">Item #{index + 1}</div>
        <button className="del-btn" type="button" onClick={() => onRemove(id)}>
          ✕ Remove
        </button>
      </div>

      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <span className="lbl">Reference Image</span>
          <label 
            className={`ref-box ${isDragging ? 'dragging' : ''}`} 
            title="Click or drag image here to upload"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {photo ? (
              <div className="ref-image-container">
                <img
                  src={photo}
                  alt="Product Preview"
                  className="ref-preview-img"
                />
                <div className="ref-replace-overlay">Replace Image</div>
              </div>
            ) : (
              <>
                <div className="ri">🖼</div>
                <div className="rt">Upload / Drag & Drop</div>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </label>
        </div>

        <div style={{ flex: 1, minWidth: '200px' }}>
          <div className="g2" style={{ marginBottom: '10px' }}>
            <div className="span2">
              <span className="lbl">Product / Item Name</span>
              <input
                className="inp"
                value={itemData.name || ''}
                placeholder="e.g. DINING CHAIR"
                style={{ fontWeight: 700, textTransform: 'uppercase' }}
                onChange={(e) => onUpdateField(id, 'name', e.target.value)}
              />
            </div>
          </div>

          {/* ===== AUTO-FILL DESCRIPTION ===== */}
          <div className="autofill-panel">
            <div className="autofill-title">⚡ Auto-Fill Description</div>
            
            {/* Structure Selection */}
            <div className="af-section">
              <div className="af-section-label">Structure</div>
              <div className="af-options">
                {AF_STRUCTURE_KEYS.map((key) => {
                  const isSelected = !!currentAf.selections?.[key];
                  return (
                    <span
                      key={key}
                      className={`af-chip ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleStructure(key)}
                    >
                      {key}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Subtypes (Wood types, Plywood types, Metal types) */}
            {showSubsections && (
              <div id={`af-subtypes-${id}`}>
                {Object.keys(currentAf.selections || {}).map((structKey) => {
                  const subtypesList = AF_DATA[structKey]?.subtypes || [];
                  if (subtypesList.length === 0) return null;

                  return (
                    <div className="af-sub-section" key={structKey}>
                      <div className="af-sub-label">
                        {structKey === 'METAL' ? 'METAL — Finish Type' : `${structKey} — Type`}
                      </div>
                      <div className="af-options">
                        {subtypesList.map((sub) => {
                          const isSubSelected = currentAf.selections[structKey]?.subtypes?.includes(sub);
                          return (
                            <span
                              key={sub}
                              className={`af-chip ${isSubSelected ? 'selected' : ''}`}
                              onClick={() => toggleSubtype(structKey, sub)}
                            >
                              {sub}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Upholstery */}
            {showSubsections && (
              <>
                <div className="af-divider"></div>
                <div className="af-section">
                  <div className="af-section-label">Upholstery</div>
                  <div className="af-options">
                    {['Back rest', 'Seating', 'Arm rest', 'Headboard'].map((opt) => {
                      const isSelected = currentAf.upholstery?.includes(opt);
                      return (
                        <span
                          key={opt}
                          className={`af-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleUph(opt)}
                        >
                          {opt}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Rope */}
            {showSubsections && (
              <>
                <div className="af-divider"></div>
                <div className="af-section">
                  <div className="af-section-label">Rope</div>
                  <div className="af-options">
                    {['Back rest', 'Seating', 'Arm rest', 'Headboard'].map((opt) => {
                      const isSelected = currentAf.rope?.includes(opt);
                      return (
                        <span
                          key={opt}
                          className={`af-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleRope(opt)}
                        >
                          {opt}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Cane */}
            {showSubsections && (
              <>
                <div className="af-divider"></div>
                <div className="af-section">
                  <div className="af-section-label">Cane</div>
                  <div className="af-options">
                    {['Back rest', 'Seating', 'Arm rest', 'Headboard'].map((opt) => {
                      const isSelected = currentAf.cane?.includes(opt);
                      return (
                        <span
                          key={opt}
                          className={`af-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleCane(opt)}
                        >
                          {opt}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Finishes */}
            {showSubsections && availableFinishes.size > 0 && (
              <>
                <div className="af-divider"></div>
                <div className="af-section">
                  <div className="af-section-label">Finishes</div>
                  <div className="af-options">
                    {[...availableFinishes].map((finish) => {
                      const isSelected = currentAf.finishes?.includes(finish);
                      return (
                        <span
                          key={finish}
                          className={`af-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => toggleFinish(finish)}
                        >
                          {finish}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <button className="af-generate-btn" type="button" onClick={handleGenerate}>
              ✦ Generate Description
            </button>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <span className="lbl">Material Specification / Description</span>
            <textarea
              className="inp"
              rows="3"
              value={itemData.spec || ''}
              placeholder="Material specification details..."
              onChange={(e) => onUpdateField(id, 'spec', e.target.value)}
            />
          </div>

          <div className="g4">
            <div>
              <span className="lbl">Unit Price ({currSymbol(currency)})</span>
              <input
                className="inp"
                type="number"
                value={itemData.unit || ''}
                placeholder="0.00"
                min="0"
                step="0.01"
                onChange={(e) => onUpdateField(id, 'unit', e.target.value)}
              />
            </div>
            <div>
              <span className="lbl">Qty</span>
              <input
                className="inp"
                type="number"
                value={itemData.qty || '1'}
                min="1"
                onChange={(e) => onUpdateField(id, 'qty', e.target.value)}
              />
            </div>
            <div>
              <span className="lbl">Unit Type</span>
              <input
                className="inp"
                value={itemData.utype || 'nos'}
                onChange={(e) => onUpdateField(id, 'utype', e.target.value)}
              />
            </div>
            <div style={{ background: 'var(--near-white)', padding: '6px 10px', border: '1px solid var(--border)' }}>
              <span className="lbl">Line Total</span>
              <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--black)', paddingTop: '2px' }}>
                {lineTotal ? `${currSymbol(currency)}${fmtNum(lineTotal)}` : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
