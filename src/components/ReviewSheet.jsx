import React, { useState, useEffect, useRef } from 'react';
import {
  getReviewDocument,
  saveReviewDocument,
  createInitialReviewDocument,
  parseQuotationSeries,
} from '../utils/reviewStorage';
import { detectQuotationChanges, synchronizeReviewDocument } from '../utils/reviewSync';
import { getQuotationById } from '../utils/storage';
import ReviewHistoryModal from './ReviewHistoryModal';
import ReviewSyncModal from './ReviewSyncModal';
import { DEFAULT_ZOOSH_LOGO } from '../utils/logo';

export default function ReviewSheet({
  series: initialSeries,
  quote: initialQuote,
  allQuotes = [],
  onBack,
  addToast = () => {},
}) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewingSnapshotNo, setViewingSnapshotNo] = useState(null); // null means active doc

  // Modals state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncTargetQuote, setSyncTargetQuote] = useState(null);
  const [syncDiff, setSyncDiff] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // New annotation input state
  const [activeAnnotationItem, setActiveAnnotationItem] = useState(null);
  const [newAnnotationText, setNewAnnotationText] = useState('');
  const [annotationType, setAnnotationType] = useState('dimension');

  // Load Review Document on mount or when initialSeries / initialQuote changes
  useEffect(() => {
    let isMounted = true;

    async function loadOrCreate() {
      setLoading(true);
      try {
        let targetSeries = initialSeries;
        if (!targetSeries && initialQuote && initialQuote.no) {
          const parsed = parseQuotationSeries(initialQuote.no);
          if (parsed.valid) {
            targetSeries = parsed.series;
          }
        }

        if (!targetSeries) {
          throw new Error('No valid 4-digit quotation series provided.');
        }

        // Section 3: Check whether a Review document already exists for that series
        let reviewDoc = await getReviewDocument(targetSeries);

        if (!reviewDoc) {
          // If no review doc exists, create one from the exact quotation clicked
          if (!initialQuote) {
            throw new Error(`No Review document exists for series ${targetSeries}, and no source quotation was provided to initialize it.`);
          }
          reviewDoc = await createInitialReviewDocument(initialQuote);
          if (isMounted) {
            addToast(`Initialized Product Review Sheet for Series ${targetSeries} (Sheet No. 01)`, 'success');
          }
        }

        if (isMounted) {
          setDoc(reviewDoc);
          setViewingSnapshotNo(null);
        }
      } catch (err) {
        console.error('Failed to load review sheet:', err);
        if (isMounted) {
          addToast(err.message || 'Error loading Review document', 'error');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadOrCreate();
    return () => {
      isMounted = false;
    };
  }, [initialSeries, initialQuote]);

  // Determine currently displayed document: active or snapshot
  const activeDocument = doc;
  const isViewingSnapshot = viewingSnapshotNo !== null && doc?.snapshots?.[viewingSnapshotNo];
  const displayedDoc = isViewingSnapshot ? doc.snapshots[viewingSnapshotNo] : activeDocument;
  const products = displayedDoc?.products || [];

  // Save changes to active review document
  const handleSaveActiveDoc = async (updatedDoc = doc) => {
    if (isViewingSnapshot) {
      addToast('Cannot modify historical snapshot. Switch to Active Document to make edits.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveReviewDocument(updatedDoc);
      setDoc(saved);
      addToast('Review Sheet saved successfully', 'success');
    } catch (err) {
      console.error('Failed to save review sheet:', err);
      addToast('Error saving Review Sheet', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Switch to an earlier snapshot
  const handleSelectSnapshot = (sheetNo) => {
    if (doc?.snapshots?.[sheetNo]) {
      setViewingSnapshotNo(sheetNo);
      addToast(`Now inspecting historical Review Sheet No. ${String(sheetNo).padStart(2, '0')}`, 'info');
    } else {
      addToast(`Snapshot for Sheet No. ${sheetNo} not found`, 'error');
    }
  };

  const handleReturnToActive = () => {
    setViewingSnapshotNo(null);
    addToast('Returned to Active Review Document', 'info');
  };

  // Open controlled sync modal
  const handleInitiateSync = (targetQuote) => {
    if (!doc || !targetQuote) return;
    try {
      const diff = detectQuotationChanges(doc, targetQuote);
      setSyncTargetQuote(targetQuote);
      setSyncDiff(diff);
      setIsSyncModalOpen(true);
    } catch (err) {
      console.error('Sync check failed:', err);
      addToast(err.message || 'Error checking quotation differences', 'error');
    }
  };

  // Confirm and commit sync
  const handleConfirmSync = async () => {
    if (!doc || !syncTargetQuote) return;
    setIsSyncing(true);
    try {
      const result = await synchronizeReviewDocument(doc, syncTargetQuote);
      if (result.success) {
        setDoc(result.doc);
        setViewingSnapshotNo(null);
        setIsSyncModalOpen(false);
        addToast(result.message, result.hasChanges ? 'success' : 'info');
      } else {
        addToast('Synchronization could not be completed', 'error');
      }
    } catch (err) {
      console.error('Synchronization failed:', err);
      addToast(err.message || 'Error synchronizing with quotation', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Product field update handlers for active document
  const handleProductUpdate = (productId, updates) => {
    if (isViewingSnapshot) {
      addToast('Historical snapshots are read-only', 'warning');
      return;
    }
    setDoc((prev) => {
      const newProducts = prev.products.map((p) => {
        if (p.id === productId) {
          return { ...p, ...updates };
        }
        return p;
      });
      return { ...prev, products: newProducts };
    });
  };

  // Toggle production approval and assign/revoke Product ID
  const handleToggleApproval = (product) => {
    if (isViewingSnapshot) return;
    const isCurrentlyApproved = product.approvalStatus === 'Approved';

    if (isCurrentlyApproved) {
      // Revoke approval
      handleProductUpdate(product.id, {
        approvalStatus: 'Revoked',
        approvedBy: '',
        approvedAt: null,
      });
      addToast(`Production approval revoked for "${product.name}"`, 'info');
    } else {
      // Approve and generate Product ID
      const newPid = `PID-${doc.series}-${String(product.itemIndex || 1).padStart(2, '0')}`;
      handleProductUpdate(product.id, {
        approvalStatus: 'Approved',
        productId: newPid,
        approvedBy: 'Production Manager',
        approvedAt: new Date().toISOString(),
      });
      addToast(`Approved "${product.name}" for production (${newPid})`, 'success');
    }
  };

  // Add Annotation / Dimension marker
  const handleAddAnnotation = (product) => {
    if (!newAnnotationText.trim()) return;
    const newAnn = {
      id: `ann-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: annotationType,
      label: newAnnotationText.trim(),
      x: 50, // Default centered position (percentage)
      y: 50,
    };
    handleProductUpdate(product.id, {
      annotations: [...(product.annotations || []), newAnn],
    });
    setNewAnnotationText('');
    setActiveAnnotationItem(null);
    addToast('Dimension / annotation added', 'success');
  };

  const handleRemoveAnnotation = (productId, annId) => {
    if (isViewingSnapshot) return;
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;
    handleProductUpdate(productId, {
      annotations: (prod.annotations || []).filter((a) => a.id !== annId),
    });
  };

  // Fabric selection table management
  const handleAddFabricRow = (productId) => {
    if (isViewingSnapshot) return;
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;
    const newRow = {
      id: `fab-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      location: 'Main Body',
      code: '',
      color: '',
      yardage: '',
      status: 'Selected',
    };
    handleProductUpdate(productId, {
      fabricSelections: [...(prod.fabricSelections || []), newRow],
    });
  };

  const handleFabricFieldChange = (productId, rowId, field, val) => {
    if (isViewingSnapshot) return;
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;
    const updated = (prod.fabricSelections || []).map((row) =>
      row.id === rowId ? { ...row, [field]: val } : row
    );
    handleProductUpdate(productId, { fabricSelections: updated });
  };

  const handleRemoveFabricRow = (productId, rowId) => {
    if (isViewingSnapshot) return;
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;
    handleProductUpdate(productId, {
      fabricSelections: (prod.fabricSelections || []).filter((r) => r.id !== rowId),
    });
  };

  // Add additional photo
  const handleAddAdditionalImage = (productId, e) => {
    if (isViewingSnapshot) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const newImg = {
        id: `img-${Date.now()}`,
        url: reader.result,
        caption: 'Production detail',
      };
      const prod = doc.products.find((p) => p.id === productId);
      if (prod) {
        handleProductUpdate(productId, {
          additionalImages: [...(prod.additionalImages || []), newImg],
        });
        addToast('Additional production photo attached', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
        <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--dark-gray)' }}>
          Loading Product Review Sheet...
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <h3>Review Document Not Found</h3>
        <p style={{ color: 'var(--gray)' }}>Could not load Review Sheet for this quotation series.</p>
        {onBack && (
          <button className="nav-btn outline" onClick={onBack} style={{ marginTop: '16px', color: 'var(--black)', borderColor: 'var(--black)' }}>
            ← Back to Dashboard
          </button>
        )}
      </div>
    );
  }

  // Find related quotations that share the same series
  const relatedQuotes = allQuotes.filter((q) => {
    const p = parseQuotationSeries(q.no);
    return p.valid && p.series === doc.series;
  });

  const displaySheetNo = isViewingSnapshot
    ? String(viewingSnapshotNo).padStart(2, '0')
    : doc.sheetNoFormatted || String(doc.currentSheetNo || 1).padStart(2, '0');

  const displaySourceQuote = isViewingSnapshot
    ? displayedDoc?.sourceQuotationNo || doc.latestQuotationNo
    : doc.latestQuotationNo;

  return (
    <div className="review-module-root" style={{ minHeight: '100vh', background: 'var(--near-white)', paddingBottom: '60px' }}>
      {/* =========================================================================
          APPLICATION TOOLBAR (strictly marked .no-print)
          Section 4 Requirement: Update history timestamps belong to application interface only.
          Excluded from printed Review Sheet document.
      ========================================================================= */}
      <div
        className="no-print"
        style={{
          background: 'var(--black)',
          color: '#fff',
          padding: '12px 24px',
          position: 'sticky',
          top: 0,
          zIndex: 300,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onBack && (
            <button
              type="button"
              className="nav-btn outline"
              onClick={onBack}
              style={{ padding: '6px 12px', fontSize: '11px', borderColor: 'rgba(255,255,255,0.3)' }}
            >
              ← Back
            </button>
          )}

          <div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', fontWeight: 700, letterSpacing: '0.05em' }}>
              Product Review Sheet &bull; Series {doc.series}
            </div>
            <div style={{ fontSize: '10px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Sheet No: {displaySheetNo} &nbsp;|&nbsp; Synced: {displaySourceQuote}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Snapshot mode notice */}
          {isViewingSnapshot && (
            <div
              style={{
                background: '#ffc107',
                color: '#000',
                padding: '4px 10px',
                borderRadius: '3px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>Viewing Snapshot {displaySheetNo}</span>
              <button
                type="button"
                onClick={handleReturnToActive}
                style={{
                  background: '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '2px',
                  padding: '2px 6px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Return to Active
              </button>
            </div>
          )}

          {/* Sync Dropdown / Button */}
          {!isViewingSnapshot && relatedQuotes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                aria-label="Synchronize with quotation revision"
                className="no-print"
                style={{
                  background: '#222',
                  color: '#fff',
                  border: '1px solid #444',
                  padding: '6px 10px',
                  fontSize: '11px',
                  borderRadius: '2px',
                  cursor: 'pointer',
                }}
                onChange={(e) => {
                  const qId = e.target.value;
                  if (!qId) return;
                  const targetQ = relatedQuotes.find((q) => q.id === qId);
                  if (targetQ) handleInitiateSync(targetQ);
                  e.target.value = '';
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Sync with Revision...
                </option>
                {relatedQuotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.no} ({q.items?.length || 0} items)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Update History button */}
          <button
            type="button"
            className="nav-btn outline"
            onClick={() => setIsHistoryOpen(true)}
            style={{ fontSize: '11px', padding: '6px 14px', borderColor: 'rgba(255,255,255,0.4)' }}
          >
            📋 Update History ({doc.history?.length || 1})
          </button>

          {/* Save Active Changes */}
          {!isViewingSnapshot && (
            <button
              type="button"
              className="nav-btn outline"
              onClick={() => handleSaveActiveDoc(doc)}
              disabled={saving}
              style={{ fontSize: '11px', padding: '6px 14px', borderColor: '#28a745', color: '#28a745' }}
            >
              {saving ? 'Saving...' : '💾 Save Review Sheet'}
            </button>
          )}

          {/* Print Document */}
          <button
            type="button"
            className="nav-btn gold"
            onClick={() => window.print()}
            style={{ fontSize: '11px', padding: '6px 16px' }}
          >
            🖨 Print / PDF
          </button>
        </div>
      </div>

      {/* Snapshot Warning Banner (when viewing historical snapshot) */}
      {isViewingSnapshot && (
        <div
          className="no-print"
          style={{
            background: '#fff3cd',
            borderBottom: '1px solid #ffeeba',
            color: '#856404',
            padding: '10px 24px',
            textAlign: 'center',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          Viewing historical snapshot <strong>Review Sheet No. {displaySheetNo}</strong> (created from quotation {displaySourceQuote}). Edits are disabled in snapshot inspection mode.{' '}
          <button
            onClick={handleReturnToActive}
            style={{
              textDecoration: 'underline',
              background: 'none',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer',
              color: '#533f03',
              marginLeft: '8px',
            }}
          >
            Return to Active Document →
          </button>
        </div>
      )}

      {/* =========================================================================
          THE PRINTABLE / VIEWABLE PRODUCT REVIEW SHEET DOCUMENT
          Section 1: Document heading: Product Review Sheet
          Section 4: QTN-{series} / REVIEW SHEET NO.: {sequential-number}
          Section 8: Latest quotation number displayed prominently
          Strict Rule: Exclude update timestamps and history log from document body
      ========================================================================= */}
      <div
        className="review-document-container"
        style={{
          maxWidth: '1000px',
          margin: '30px auto',
          background: '#fff',
          boxShadow: 'var(--shadow-md)',
          padding: '40px 48px',
          borderRadius: '2px',
          border: '1px solid var(--border)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* DOCUMENT HEADER */}
        <div
          style={{
            borderBottom: '2px solid var(--black)',
            paddingBottom: '20px',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          {/* Left: Brand & Document Heading */}
          <div>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '26px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--black)',
              }}
            >
              ZOOSH
            </div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                color: 'var(--gray)',
                marginBottom: '10px',
              }}
            >
              Custom Furniture Company
            </div>

            <h1
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '22px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--near-black)',
                margin: '12px 0 0 0',
              }}
            >
              Product Review Sheet
            </h1>
          </div>

          {/* Right: Review Sheet Identity & Source Metadata */}
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                color: 'var(--black)',
                background: 'var(--near-white)',
                padding: '6px 14px',
                border: '1px solid var(--border)',
                borderRadius: '2px',
                display: 'inline-block',
                marginBottom: '8px',
              }}
            >
              QTN-{doc.series} / REVIEW SHEET NO.: {displaySheetNo}
            </div>

            <div style={{ fontSize: '12px', color: 'var(--dark-gray)', margin: '4px 0' }}>
              <strong>Latest Quotation:</strong>{' '}
              <span style={{ fontWeight: 700, color: 'var(--black)' }}>{displaySourceQuote}</span>
            </div>

            <div style={{ fontSize: '11px', color: 'var(--gray)' }}>
              <strong>Series Identifier:</strong> {doc.series}
            </div>

            <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '2px' }}>
              <strong>Date:</strong> {new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}
            </div>
          </div>
        </div>

        {/* CLIENT & PROJECT METADATA */}
        <div
          style={{
            background: 'var(--near-white)',
            border: '1px solid var(--border)',
            borderRadius: '2px',
            padding: '16px 20px',
            marginBottom: '32px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
          }}
        >
          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700 }}>
              Client Name
            </span>
            <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '2px' }}>
              {displayedDoc?.client?.name || '—'}
            </div>
            {displayedDoc?.client?.co && (
              <div style={{ fontSize: '12px', color: 'var(--gray)' }}>{displayedDoc.client.co}</div>
            )}
          </div>

          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700 }}>
              Project Location
            </span>
            <div style={{ fontSize: '13px', color: 'var(--dark-gray)', marginTop: '2px' }}>
              {displayedDoc?.client?.addr || '—'}
            </div>
          </div>

          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700 }}>
              Contact Details
            </span>
            <div style={{ fontSize: '13px', color: 'var(--dark-gray)', marginTop: '2px' }}>
              {displayedDoc?.client?.phone || '—'}
            </div>
          </div>
        </div>

        {/* =========================================================================
            PRODUCTS REVIEW LIST (in strict quotation order)
        ========================================================================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {products.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--gray)', fontStyle: 'italic' }}>
              No products available in this review sheet.
            </div>
          ) : (
            products.map((product, pIdx) => {
              const isApproved = product.approvalStatus === 'Approved';

              return (
                <div
                  key={product.id || pIdx}
                  className="review-product-card"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                    background: '#fff',
                    pageBreakInside: 'avoid',
                  }}
                >
                  {/* Product Header Row */}
                  <div
                    style={{
                      background: 'var(--near-white)',
                      borderBottom: '1px solid var(--border)',
                      padding: '12px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span
                        style={{
                          background: 'var(--black)',
                          color: '#fff',
                          width: '24px',
                          height: '24px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '50%',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {pIdx + 1}
                      </span>

                      <h3
                        style={{
                          fontFamily: 'var(--font-serif)',
                          fontSize: '17px',
                          fontWeight: 700,
                          margin: 0,
                          color: 'var(--black)',
                        }}
                      >
                        {product.name}
                      </h3>

                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: 'var(--dark-gray)',
                          background: '#fff',
                          padding: '3px 8px',
                          border: '1px solid var(--border)',
                          borderRadius: '2px',
                        }}
                      >
                        Qty: {product.qty} {product.utype || 'nos'}
                      </span>
                    </div>

                    {/* Production Approval Badge & Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {isApproved ? (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: '#e8f5e9',
                            color: '#2e7d32',
                            border: '1px solid #a5d6a7',
                            padding: '4px 10px',
                            borderRadius: '3px',
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                          }}
                        >
                          <span>✓ APPROVED FOR PRODUCTION</span>
                          <span style={{ fontWeight: 800, color: '#1b5e20' }}>
                            [{product.productId || `PID-${doc.series}-${String(pIdx + 1).padStart(2, '0')}`}]
                          </span>
                        </div>
                      ) : (
                        <span
                          style={{
                            display: 'inline-block',
                            background: '#fff8e1',
                            color: '#f57f17',
                            border: '1px solid #ffe082',
                            padding: '4px 8px',
                            borderRadius: '3px',
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          ⏳ PENDING APPROVAL
                        </span>
                      )}

                      {!isViewingSnapshot && (
                        <button
                          type="button"
                          className="no-print del-btn"
                          onClick={() => handleToggleApproval(product)}
                          style={{
                            borderColor: isApproved ? '#ff5555' : '#28a745',
                            color: isApproved ? '#ff5555' : '#28a745',
                            fontSize: '10px',
                            padding: '4px 8px',
                          }}
                        >
                          {isApproved ? 'Revoke Approval' : '✓ Approve for Production'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Product Body: Two Columns (Images/Annotations on left, Specs/Notes/Fabric on right) */}
                  <div
                    style={{
                      padding: '20px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1.1fr',
                      gap: '24px',
                    }}
                  >
                    {/* LEFT COLUMN: Reference Image + Dimension Annotations */}
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px',
                        }}
                      >
                        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Quotation Reference Image
                        </span>
                        {!isViewingSnapshot && (
                          <div className="no-print" style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() =>
                                handleProductUpdate(product.id, { imageLocked: !product.imageLocked })
                              }
                              style={{
                                background: product.imageLocked ? 'var(--black)' : '#fff',
                                color: product.imageLocked ? '#fff' : 'var(--black)',
                                border: '1px solid var(--border)',
                                fontSize: '10px',
                                padding: '2px 8px',
                                borderRadius: '2px',
                                cursor: 'pointer',
                              }}
                            >
                              {product.imageLocked ? '🔒 Locked' : '🔓 Lock Image'}
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Image Canvas with Annotations */}
                      <div
                        style={{
                          position: 'relative',
                          border: '1px solid var(--border)',
                          borderRadius: '2px',
                          background: '#f9f9f9',
                          minHeight: '220px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                        }}
                      >
                        {product.photo ? (
                          <img
                            src={product.photo}
                            alt={product.name}
                            style={{
                              maxWidth: '100%',
                              maxHeight: '260px',
                              objectFit: 'contain',
                              display: 'block',
                            }}
                          />
                        ) : (
                          <div style={{ color: 'var(--gray)', fontSize: '12px', fontStyle: 'italic' }}>
                            No reference image provided
                          </div>
                        )}

                        {/* Dimension & Marker Badges overlaid on image */}
                        {product.annotations &&
                          product.annotations.map((ann) => (
                            <div
                              key={ann.id}
                              style={{
                                position: 'absolute',
                                left: `${ann.x}%`,
                                top: `${ann.y}%`,
                                transform: 'translate(-50%, -50%)',
                                background: 'rgba(0, 0, 0, 0.85)',
                                color: '#fff',
                                padding: '3px 8px',
                                borderRadius: '3px',
                                fontSize: '10px',
                                fontWeight: 700,
                                letterSpacing: '0.04em',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.4)',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                zIndex: 10,
                              }}
                            >
                              <span>{ann.label}</span>
                              {!isViewingSnapshot && (
                                <button
                                  type="button"
                                  className="no-print"
                                  onClick={() => handleRemoveAnnotation(product.id, ann.id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#ff8888',
                                    cursor: 'pointer',
                                    fontSize: '11px',
                                    padding: '0 2px',
                                    lineHeight: 1,
                                  }}
                                  title="Delete annotation"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                      </div>

                      {/* Annotation Controls (no-print) */}
                      {!isViewingSnapshot && !product.imageLocked && (
                        <div className="no-print" style={{ marginTop: '10px' }}>
                          {activeAnnotationItem === product.id ? (
                            <div
                              style={{
                                background: 'var(--near-white)',
                                border: '1px solid var(--border)',
                                padding: '10px',
                                borderRadius: '3px',
                              }}
                            >
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <select
                                  aria-label="Annotation type"
                                  className="inp"
                                  style={{ width: '130px', padding: '4px 6px', fontSize: '11px' }}
                                  value={annotationType}
                                  onChange={(e) => setAnnotationType(e.target.value)}
                                >
                                  <option value="dimension">Dimension Line</option>
                                  <option value="note">Production Note</option>
                                </select>
                                <input
                                  type="text"
                                  className="inp"
                                  placeholder={annotationType === 'dimension' ? 'e.g. W: 1800mm x D: 900mm' : 'e.g. High density foam'}
                                  value={newAnnotationText}
                                  onChange={(e) => setNewAnnotationText(e.target.value)}
                                  style={{ flex: 1, padding: '4px 8px', fontSize: '11px' }}
                                />
                              </div>
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="del-btn"
                                  onClick={() => setActiveAnnotationItem(null)}
                                  style={{ fontSize: '10px', padding: '4px 8px' }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="nav-btn gold"
                                  onClick={() => handleAddAnnotation(product)}
                                  style={{ fontSize: '10px', padding: '4px 12px' }}
                                >
                                  Add Dimension / Note
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="del-btn"
                              onClick={() => {
                                setActiveAnnotationItem(product.id);
                                setNewAnnotationText('');
                              }}
                              style={{
                                width: '100%',
                                fontSize: '11px',
                                padding: '6px',
                                borderColor: 'var(--border)',
                                background: '#fff',
                              }}
                            >
                              + Add Dimension Line or Measurement Note
                            </button>
                          )}
                        </div>
                      )}

                      {/* Additional Reference Photos */}
                      {product.additionalImages && product.additionalImages.length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--gray)' }}>
                            Additional Production Views
                          </span>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                            {product.additionalImages.map((img) => (
                              <img
                                key={img.id}
                                src={img.url}
                                alt="Detail"
                                style={{
                                  width: '60px',
                                  height: '60px',
                                  objectFit: 'cover',
                                  border: '1px solid var(--border)',
                                  borderRadius: '2px',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {!isViewingSnapshot && (
                        <div className="no-print" style={{ marginTop: '8px' }}>
                          <label
                            style={{
                              fontSize: '10px',
                              color: 'var(--gray)',
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            + Attach additional production photo
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => handleAddAdditionalImage(product.id, e)}
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {/* RIGHT COLUMN: Specifications, Fabric Table, Customer Notes */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {/* Specifications / Design Information */}
                      <div>
                        <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
                          Design & Technical Specifications
                        </span>
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--near-black)',
                            lineHeight: 1.6,
                            marginTop: '4px',
                            whiteSpace: 'pre-line',
                            background: 'var(--near-white)',
                            padding: '10px 14px',
                            borderRadius: '2px',
                            border: '1px solid var(--border)',
                          }}
                        >
                          {product.spec || 'No additional specifications provided in quotation.'}
                        </div>
                      </div>

                      {/* Fabric Selection Table */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
                            Fabric & Material Selection Table
                          </span>
                          {!isViewingSnapshot && (
                            <button
                              type="button"
                              className="no-print del-btn"
                              onClick={() => handleAddFabricRow(product.id)}
                              style={{ fontSize: '10px', padding: '2px 8px' }}
                            >
                              + Add Fabric Row
                            </button>
                          )}
                        </div>

                        {(!product.fabricSelections || product.fabricSelections.length === 0) ? (
                          <div style={{ fontSize: '11px', color: 'var(--gray)', fontStyle: 'italic', padding: '8px', background: 'var(--near-white)', borderRadius: '2px' }}>
                            No fabric records added yet.
                          </div>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                            <thead>
                              <tr style={{ background: 'var(--near-white)', borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Part / Location</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Fabric Code / Brand</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Color</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Meters</th>
                                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Status</th>
                                {!isViewingSnapshot && <th className="no-print" style={{ width: '20px' }}></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {product.fabricSelections.map((fab) => (
                                <tr key={fab.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                  <td style={{ padding: '6px 8px' }}>
                                    {!isViewingSnapshot ? (
                                      <input
                                        className="inp"
                                        style={{ padding: '3px 6px', fontSize: '11px' }}
                                        value={fab.location}
                                        onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'location', e.target.value)}
                                      />
                                    ) : (
                                      fab.location
                                    )}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    {!isViewingSnapshot ? (
                                      <input
                                        className="inp"
                                        style={{ padding: '3px 6px', fontSize: '11px' }}
                                        placeholder="e.g. Sarom 401"
                                        value={fab.code}
                                        onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'code', e.target.value)}
                                      />
                                    ) : (
                                      fab.code || '—'
                                    )}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    {!isViewingSnapshot ? (
                                      <input
                                        className="inp"
                                        style={{ padding: '3px 6px', fontSize: '11px' }}
                                        placeholder="e.g. Beige"
                                        value={fab.color}
                                        onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'color', e.target.value)}
                                      />
                                    ) : (
                                      fab.color || '—'
                                    )}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    {!isViewingSnapshot ? (
                                      <input
                                        className="inp"
                                        style={{ padding: '3px 6px', fontSize: '11px', width: '50px' }}
                                        placeholder="12m"
                                        value={fab.yardage}
                                        onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'yardage', e.target.value)}
                                      />
                                    ) : (
                                      fab.yardage || '—'
                                    )}
                                  </td>
                                  <td style={{ padding: '6px 8px' }}>
                                    {!isViewingSnapshot ? (
                                      <select
                                        className="inp"
                                        style={{ padding: '3px 6px', fontSize: '10px' }}
                                        value={fab.status}
                                        onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'status', e.target.value)}
                                      >
                                        <option value="Selected">Selected</option>
                                        <option value="Confirmed">Confirmed</option>
                                        <option value="Pending">Pending</option>
                                      </select>
                                    ) : (
                                      fab.status
                                    )}
                                  </td>
                                  {!isViewingSnapshot && (
                                    <td className="no-print" style={{ padding: '6px 4px' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveFabricRow(product.id, fab.id)}
                                        style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', fontSize: '12px' }}
                                      >
                                        ✕
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {/* Customer Notes */}
                      <div>
                        <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)' }}>
                          Customer Production Notes
                        </span>
                        {!isViewingSnapshot ? (
                          <textarea
                            className="inp"
                            rows={3}
                            placeholder="Enter customer specific feedback, finish preferences, or special requests..."
                            value={product.customerNotes || ''}
                            onChange={(e) => handleProductUpdate(product.id, { customerNotes: e.target.value })}
                            style={{
                              marginTop: '4px',
                              width: '100%',
                              padding: '8px 10px',
                              fontSize: '11px',
                              lineHeight: 1.5,
                              resize: 'vertical',
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              marginTop: '4px',
                              fontSize: '12px',
                              padding: '8px 12px',
                              background: 'var(--near-white)',
                              borderRadius: '2px',
                              border: '1px solid var(--border)',
                              fontStyle: product.customerNotes ? 'normal' : 'italic',
                              color: product.customerNotes ? 'var(--black)' : 'var(--gray)',
                            }}
                          >
                            {product.customerNotes || 'No customer notes recorded.'}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* DOCUMENT FOOTER SIGNATURES */}
        <div
          style={{
            marginTop: '48px',
            paddingTop: '24px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            pageBreakInside: 'avoid',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em' }}>
              Reviewed By (Zoosh Production)
            </div>
            <div style={{ marginTop: '36px', borderTop: '1px solid var(--black)', width: '200px' }}></div>
            <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '4px' }}>Authorized Signatory</div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.08em' }}>
              Client Approval
            </div>
            <div style={{ marginTop: '36px', borderTop: '1px solid var(--black)', width: '200px', marginLeft: 'auto' }}></div>
            <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '4px' }}>Client Signature & Date</div>
          </div>
        </div>
      </div>

      {/* History and Snapshots Inspection Modal */}
      <ReviewHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={doc.history || []}
        snapshots={doc.snapshots || {}}
        activeSheetNo={doc.currentSheetNo}
        viewingSnapshotNo={viewingSnapshotNo}
        onSelectSnapshot={handleSelectSnapshot}
        onReturnToActive={handleReturnToActive}
      />

      {/* Controlled Synchronization Modal */}
      <ReviewSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        diffSummary={syncDiff?.diffSummary}
        hasChanges={syncDiff?.hasChanges}
        targetQuoteNo={syncTargetQuote?.no}
        currentSheetNo={doc.currentSheetNo}
        nextSheetNo={(doc.currentSheetNo || 1) + 1}
        onConfirmSync={handleConfirmSync}
        isSyncing={isSyncing}
      />
    </div>
  );
}
