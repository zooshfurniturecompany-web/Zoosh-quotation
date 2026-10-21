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
import ReviewToolbar, { TOOLS } from './ReviewToolbar';
import AnnotationCanvas from './AnnotationCanvas';
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

  // Microsoft Word Interface State
  const [activeTool, setActiveTool] = useState(TOOLS.DIMENSION);
  const [activeColor, setActiveColor] = useState('#e74c3c');
  const [activeStroke, setActiveStroke] = useState(2);
  const [orientation, setOrientation] = useState('landscape'); // 'landscape' | 'portrait'
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Modals state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncTargetQuote, setSyncTargetQuote] = useState(null);
  const [syncDiff, setSyncDiff] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

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

  // Total Pages = 1 Title Page + 1 page per product
  const totalPages = Math.max(1, 1 + products.length);

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

  // Push state to undo stack before mutation
  const pushToUndo = () => {
    if (!doc) return;
    setUndoStack((prev) => [...prev.slice(-15), JSON.stringify(doc.products)]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0 || isViewingSnapshot) return;
    const last = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [...prev, JSON.stringify(doc.products)]);
    setUndoStack((prev) => prev.slice(0, -1));
    setDoc((prev) => ({ ...prev, products: JSON.parse(last) }));
    addToast('Undo action applied', 'info');
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || isViewingSnapshot) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [...prev, JSON.stringify(doc.products)]);
    setRedoStack((prev) => prev.slice(0, -1));
    setDoc((prev) => ({ ...prev, products: JSON.parse(next) }));
    addToast('Redo action applied', 'info');
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
    pushToUndo();
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

  // Fabric selection table management (Section 8: Sl.no., Part Name, Brand, Catalogue Code, Reference Image, Total Meter, Remark)
  const handleAddFabricRow = (productId) => {
    if (isViewingSnapshot) return;
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;
    const currentRows = prod.fabricSelections || [];
    const newRow = {
      id: `fab-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      slNo: currentRows.length + 1,
      partName: 'Main Body',
      brand: 'Sarom',
      catalogueCode: 'Velvet #101',
      refImage: null,
      totalMeter: '12 m',
      remark: 'Client approved',
    };
    handleProductUpdate(productId, {
      fabricSelections: [...currentRows, newRow],
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

  // Add additional photo labeled Picture - 2, Picture - 3...
  const handleAddAdditionalImage = (productId, e) => {
    if (isViewingSnapshot) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const prod = doc.products.find((p) => p.id === productId);
      if (prod) {
        const nextPicNum = (prod.additionalImages?.length || 0) + 2;
        const newImg = {
          id: `img-${Date.now()}`,
          url: reader.result,
          label: `Picture - ${nextPicNum}`,
          caption: 'Production detail view',
        };
        handleProductUpdate(productId, {
          additionalImages: [...(prod.additionalImages || []), newImg],
        });
        addToast(`Attached ${newImg.label}`, 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center', fontFamily: 'var(--font-sans)', background: '#eef0f3', minHeight: '100vh' }}>
        <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--dark-gray)' }}>
          Loading Microsoft Word Review Document...
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', background: '#eef0f3', minHeight: '100vh' }}>
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

  // Related quotations that share the same series
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

  const isPortrait = orientation === 'portrait';
  const a4PageWidth = isPortrait ? '794px' : '1080px';
  const a4PageMinHeight = isPortrait ? '1122px' : '764px';

  return (
    <div
      className="review-word-environment"
      style={{
        minHeight: '100vh',
        background: '#e9edf2',
        color: '#111111',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* =========================================================================
          1. MICROSOFT WORD APPLICATION TITLE BAR (no-print)
      ========================================================================= */}
      <div
        className="no-print"
        style={{
          background: '#2b579a', // Official Word Blue Header
          color: '#ffffff',
          padding: '8px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.3)',
                padding: '4px 10px',
                borderRadius: '3px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ← Back to Quotations
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>📄</span>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.02em' }}>
                QTN-{doc.series} — Product Review Sheet ({displaySourceQuote}) - Microsoft Word Mode
              </div>
              <div style={{ fontSize: '10px', opacity: 0.85 }}>
                Review Sheet No.: {displaySheetNo} &bull; Series: {doc.series} &bull; {saving ? 'Saving changes...' : 'Saved to cloud & local'}
              </div>
            </div>
          </div>
        </div>

        {/* Top Right Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Sync Revision Dropdown */}
          {!isViewingSnapshot && relatedQuotes.length > 0 && (
            <select
              aria-label="Sync with quotation revision"
              className="no-print"
              style={{
                background: '#1d3b6a',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.35)',
                padding: '5px 8px',
                fontSize: '11px',
                borderRadius: '3px',
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
                Sync with Quotation Revision...
              </option>
              {relatedQuotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.no} ({q.items?.length || 0} items)
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            style={{
              background: 'rgba(255,255,255,0.15)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.3)',
              padding: '5px 12px',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            📋 Update History ({doc.history?.length || 1})
          </button>

          {!isViewingSnapshot && (
            <button
              type="button"
              onClick={() => handleSaveActiveDoc(doc)}
              disabled={saving}
              style={{
                background: '#27ae60',
                color: '#ffffff',
                border: 'none',
                padding: '5px 14px',
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              {saving ? 'Saving...' : '💾 Save Document'}
            </button>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            style={{
              background: '#ffffff',
              color: '#2b579a',
              border: 'none',
              padding: '5px 14px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '3px',
              cursor: 'pointer',
            }}
          >
            🖨 Print / PDF
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. MICROSOFT WORD EDITING RIBBON / TOOLBAR (All 9 Tools + Box + Styling)
      ========================================================================= */}
      <ReviewToolbar
        activeTool={activeTool}
        onSelectTool={setActiveTool}
        activeColor={activeColor}
        onChangeColor={setActiveColor}
        activeStroke={activeStroke}
        onChangeStroke={setActiveStroke}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        orientation={orientation}
        onToggleOrientation={() => setOrientation(isPortrait ? 'landscape' : 'portrait')}
        isLocked={isViewingSnapshot}
      />

      {/* Snapshot Warning Banner (when inspecting past versions) */}
      {isViewingSnapshot && (
        <div
          className="no-print"
          style={{
            background: '#fff3cd',
            borderBottom: '1px solid #ffeeba',
            color: '#856404',
            padding: '8px 20px',
            textAlign: 'center',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          Viewing historical snapshot <strong>Review Sheet No. {displaySheetNo}</strong> (Quotation: {displaySourceQuote}).
          Inspection mode is read-only.{' '}
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
          3. MICROSOFT WORD DOCUMENT CANVAS (Physical Multi-Page A4 Environment)
      ========================================================================= */}
      <div
        className="word-workspace-canvas"
        style={{
          flex: 1,
          padding: '24px 16px 80px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px',
        }}
      >
        {/* =======================================================================
            PAGE 1: FORMAL TITLE PAGE / COVER SHEET (A4)
        ======================================================================= */}
        <div
          className="word-page-sheet a4-page title-page"
          style={{
            width: a4PageWidth,
            minHeight: a4PageMinHeight,
            background: '#ffffff',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.12)',
            border: '1px solid #d1d5db',
            borderRadius: '2px',
            padding: '48px 56px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}
        >
          <div>
            {/* Top Branding & Main Heading */}
            <div style={{ borderBottom: '2px solid #111', paddingBottom: '24px', marginBottom: '32px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: '32px',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#111',
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
                      marginTop: '2px',
                    }}
                  >
                    Custom Furniture Company
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-serif)',
                      fontSize: '16px',
                      fontWeight: 700,
                      color: '#111',
                      background: '#f8f9fa',
                      border: '1px solid #e0e0e0',
                      padding: '6px 14px',
                      borderRadius: '2px',
                      display: 'inline-block',
                    }}
                  >
                    QTN-{doc.series} / REVIEW SHEET NO.: {displaySheetNo}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '4px' }}>
                    Document No.: QTN-{doc.series} / REV-01
                  </div>
                </div>
              </div>

              <h1
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '28px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#111',
                  margin: '28px 0 0',
                  textAlign: 'center',
                }}
              >
                Product Review Sheet
              </h1>
            </div>

            {/* Quotation & Client Metadata Grid (Section 7) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '16px',
                background: '#f8f9fa',
                border: '1px solid #e0e0e0',
                padding: '20px 24px',
                borderRadius: '2px',
                marginBottom: '36px',
              }}
            >
              <div>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted)' }}>
                  Client Name
                </span>
                <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>
                  {displayedDoc?.client?.name || '—'}
                </div>
                {displayedDoc?.client?.co && (
                  <div style={{ fontSize: '12px', color: 'var(--gray)' }}>{displayedDoc.client.co}</div>
                )}
              </div>

              <div>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted)' }}>
                  Place / Delivery Location
                </span>
                <div style={{ fontSize: '14px', color: '#222', marginTop: '2px' }}>
                  {displayedDoc?.client?.addr || '—'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted)' }}>
                  Contact Number
                </span>
                <div style={{ fontSize: '14px', color: '#222', marginTop: '2px' }}>
                  {displayedDoc?.client?.phone || '—'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--muted)' }}>
                  Source Quotation Revision
                </span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#111', marginTop: '2px' }}>
                  {displaySourceQuote}
                </div>
              </div>
            </div>

            {/* Complete Original Mandatory Order Specification Notice (Section 7) */}
            <div
              style={{
                border: '1px solid #d1d5db',
                borderRadius: '3px',
                padding: '20px 24px',
                background: '#fafafa',
              }}
            >
              <h3
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: '13px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#111',
                  margin: '0 0 10px',
                }}
              >
                Important Note Regarding Your Furniture Order Specification
              </h3>
              <ol
                style={{
                  margin: 0,
                  paddingLeft: '18px',
                  fontSize: '11px',
                  lineHeight: 1.7,
                  color: '#444',
                }}
              >
                <li>
                  This Product Review Sheet serves as the authoritative manufacturing specification document for all custom furniture pieces commissioned under the referenced quotation.
                </li>
                <li>
                  All production annotations, dimension lines, joint callouts, and fabric details approved within this document supersede preliminary design representations and govern factory fabrication.
                </li>
                <li>
                  Standard manufacturing tolerances of &plusmn;10 mm to &plusmn;20 mm apply to handcrafted solid timber frames, cane webbing, hand-upholstered contours, and cushioning foam layers.
                </li>
                <li>
                  Reference images indicate aesthetic intent, proportions, and detailing. Natural wood grain, cane textures, veneer figures, and fabric batch dye-lots inherently feature organic variations.
                </li>
                <li>
                  Any modification to dimensions, frame structure, internal foam density, or upholstery fabric requested after production approval has been authorized will require a formal revision, affecting pricing and delivery schedules.
                </li>
                <li>
                  Production approval becomes legally binding upon verification by the Production Manager and Client Signatory.
                </li>
              </ol>
            </div>
          </div>

          {/* Title Page Footer */}
          <div
            style={{
              borderTop: '1px solid #e0e0e0',
              paddingTop: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '10px',
              color: 'var(--gray)',
            }}
          >
            <span>Date: {new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
            <span>Page 1 of {totalPages}</span>
            <span>ZOOSH Custom Furniture Specification Document</span>
          </div>
        </div>

        {/* =======================================================================
            PAGE 2..N: INDIVIDUAL PRODUCT PAGES (Strictly One Product Per A4 Page)
        ======================================================================= */}
        {products.map((product, pIdx) => {
          const pageNum = pIdx + 2;
          const isApproved = product.approvalStatus === 'Approved';

          return (
            <div
              key={product.id || pIdx}
              className="word-page-sheet a4-page product-page"
              style={{
                width: a4PageWidth,
                minHeight: a4PageMinHeight,
                background: '#ffffff',
                boxShadow: '0 4px 18px rgba(0, 0, 0, 0.12)',
                border: '1px solid #d1d5db',
                borderRadius: '2px',
                padding: '36px 44px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                pageBreakAfter: 'always',
              }}
            >
              <div>
                {/* Product Page Fixed Running Header */}
                <div
                  style={{
                    borderBottom: '1.5px solid #111',
                    paddingBottom: '10px',
                    marginBottom: '16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--gray)',
                  }}
                >
                  <span>ZOOSH CUSTOM FURNITURE &bull; PRODUCT REVIEW SHEET</span>
                  <span>QTN-{doc.series} / REVIEW SHEET NO.: {displaySheetNo}</span>
                </div>

                {/* Fixed Product Heading & Approval Banner */}
                <div
                  style={{
                    background: '#f8f9fa',
                    border: '1px solid #e5e7eb',
                    padding: '12px 18px',
                    borderRadius: '2px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                    marginBottom: '18px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span
                      style={{
                        background: '#111',
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
                    <h2
                      style={{
                        fontFamily: 'var(--font-serif)',
                        fontSize: '18px',
                        fontWeight: 700,
                        margin: 0,
                        color: '#111',
                      }}
                    >
                      {product.name}
                    </h2>
                    <span
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        background: '#fff',
                        padding: '2px 8px',
                        border: '1px solid #d1d5db',
                        borderRadius: '2px',
                      }}
                    >
                      Qty: {product.qty} {product.utype || 'nos'}
                    </span>
                  </div>

                  {/* Production Approval & Product ID */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isApproved ? (
                      <span
                        style={{
                          background: '#e8f5e9',
                          color: '#2e7d32',
                          border: '1px solid #a5d6a7',
                          padding: '3px 10px',
                          borderRadius: '2px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        ✓ APPROVED [{product.productId || `PID-${doc.series}-${String(pIdx + 1).padStart(2, '0')}`}]
                      </span>
                    ) : (
                      <span
                        style={{
                          background: '#fff8e1',
                          color: '#f57f17',
                          border: '1px solid #ffe082',
                          padding: '3px 8px',
                          borderRadius: '2px',
                          fontSize: '10px',
                          fontWeight: 600,
                        }}
                      >
                        ⏳ PENDING PRODUCTION APPROVAL
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
                          padding: '3px 8px',
                        }}
                      >
                        {isApproved ? 'Revoke Approval' : '✓ Approve'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Product Layout: Two Balanced Columns */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isPortrait ? '1fr' : '1.25fr 1fr',
                    gap: '24px',
                    alignItems: 'start',
                  }}
                >
                  {/* LEFT COLUMN: Picture - 1 & Interactive Vector Annotation Canvas */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Picture - 1: Quotation Reference & Production Drawing
                      </span>
                      {!isViewingSnapshot && (
                        <button
                          type="button"
                          className="no-print"
                          onClick={() => handleProductUpdate(product.id, { imageLocked: !product.imageLocked })}
                          style={{
                            background: product.imageLocked ? '#111' : '#fff',
                            color: product.imageLocked ? '#fff' : '#111',
                            border: '1px solid #ccc',
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '2px',
                            cursor: 'pointer',
                          }}
                        >
                          {product.imageLocked ? '🔒 Position Locked' : '🔓 Lock Position'}
                        </button>
                      )}
                    </div>

                    {/* Active Interactive Annotation Canvas with All 9 Tools */}
                    <div style={{ height: isPortrait ? '340px' : '390px', width: '100%' }}>
                      <AnnotationCanvas
                        imageSrc={product.photo}
                        annotations={product.annotations || []}
                        onChangeAnnotations={(newAnns) => handleProductUpdate(product.id, { annotations: newAnns })}
                        activeTool={activeTool}
                        activeColor={activeColor}
                        activeStroke={activeStroke}
                        isLocked={product.imageLocked}
                        isReadOnly={isViewingSnapshot}
                        onApproveProduct={() => {
                          if (!isApproved) handleToggleApproval(product);
                        }}
                      />
                    </div>

                    {/* Additional Images (Picture - 2, Picture - 3...) */}
                    {product.additionalImages && product.additionalImages.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--gray)' }}>
                          Additional Views:
                        </span>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                          {product.additionalImages.map((img) => (
                            <div key={img.id} style={{ textAlign: 'center' }}>
                              <img
                                src={img.url}
                                alt={img.label}
                                style={{
                                  width: '64px',
                                  height: '64px',
                                  objectFit: 'cover',
                                  border: '1px solid #ccc',
                                  borderRadius: '2px',
                                }}
                              />
                              <div style={{ fontSize: '9px', fontWeight: 600, color: '#555', marginTop: '2px' }}>
                                {img.label || 'Picture'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!isViewingSnapshot && (
                      <div className="no-print" style={{ marginTop: '8px' }}>
                        <label
                          style={{
                            fontSize: '10px',
                            color: '#2b579a',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          + Upload Additional Image (Picture - {(product.additionalImages?.length || 0) + 2})
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

                  {/* RIGHT COLUMN: Fabric Details Table & Customer Note Area */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Selected Fabric Details Table (Section 8) */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Selected Fabric Details
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
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--gray)',
                            fontStyle: 'italic',
                            padding: '12px',
                            background: '#f8f9fa',
                            border: '1px solid #e5e7eb',
                            borderRadius: '2px',
                            textAlign: 'center',
                          }}
                        >
                          No fabric specifications added yet. Click "+ Add Fabric Row" to allocate materials.
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                            <thead>
                              <tr style={{ background: '#f8f9fa', borderBottom: '1.5px solid #111' }}>
                                <th style={{ padding: '5px 4px', textAlign: 'center', width: '28px' }}>Sl.</th>
                                <th style={{ padding: '5px 6px', textAlign: 'left' }}>Part Name</th>
                                <th style={{ padding: '5px 6px', textAlign: 'left' }}>Brand</th>
                                <th style={{ padding: '5px 6px', textAlign: 'left' }}>Catalogue Code</th>
                                <th style={{ padding: '5px 6px', textAlign: 'left' }}>Total Meter</th>
                                <th style={{ padding: '5px 6px', textAlign: 'left' }}>Remark</th>
                                {!isViewingSnapshot && <th className="no-print" style={{ width: '20px' }}></th>}
                              </tr>
                            </thead>
                            <tbody>
                              {product.fabricSelections.map((fab, fIdx) => (
                                <tr key={fab.id || fIdx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                  <td style={{ padding: '4px', textAlign: 'center', fontWeight: 600 }}>{fIdx + 1}</td>
                                  <td style={{ padding: '4px 6px' }}>
                                    {!isViewingSnapshot ? (
                                      <input
                                        className="inp"
                                        style={{ padding: '2px 4px', fontSize: '10px' }}
                                        value={fab.partName || fab.location || ''}
                                        onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'partName', e.target.value)}
                                      />
                                    ) : (
                                      fab.partName || fab.location || '—'
                                    )}
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    {!isViewingSnapshot ? (
                                      <input
                                        className="inp"
                                        style={{ padding: '2px 4px', fontSize: '10px' }}
                                        value={fab.brand || ''}
                                        onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'brand', e.target.value)}
                                      />
                                    ) : (
                                      fab.brand || '—'
                                    )}
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    {!isViewingSnapshot ? (
                                      <input
                                        className="inp"
                                        style={{ padding: '2px 4px', fontSize: '10px' }}
                                        value={fab.catalogueCode || fab.code || ''}
                                        onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'catalogueCode', e.target.value)}
                                      />
                                    ) : (
                                      fab.catalogueCode || fab.code || '—'
                                    )}
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    {!isViewingSnapshot ? (
                                      <input
                                        className="inp"
                                        style={{ padding: '2px 4px', fontSize: '10px', width: '50px' }}
                                        value={fab.totalMeter || fab.yardage || ''}
                                        onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'totalMeter', e.target.value)}
                                      />
                                    ) : (
                                      fab.totalMeter || fab.yardage || '—'
                                    )}
                                  </td>
                                  <td style={{ padding: '4px 6px' }}>
                                    {!isViewingSnapshot ? (
                                      <input
                                        className="inp"
                                        style={{ padding: '2px 4px', fontSize: '10px' }}
                                        value={fab.remark || ''}
                                        placeholder="e.g. Contrast"
                                        onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'remark', e.target.value)}
                                      />
                                    ) : (
                                      fab.remark || '—'
                                    )}
                                  </td>
                                  {!isViewingSnapshot && (
                                    <td className="no-print" style={{ padding: '4px' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveFabricRow(product.id, fab.id)}
                                        style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', fontSize: '11px' }}
                                      >
                                        ✕
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Designated Customer Note Area (Word Editable Form Field) */}
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Customer Note
                      </span>
                      <div style={{ fontSize: '10px', color: 'var(--gray)', margin: '1px 0 4px' }}>
                        Designated editable note area for customer feedback & finish requirements:
                      </div>

                      {!isViewingSnapshot ? (
                        <textarea
                          rows={4}
                          placeholder="Type customer notes, finish instructions, or specific upholstery preferences..."
                          value={product.customerNotes || ''}
                          onChange={(e) => handleProductUpdate(product.id, { customerNotes: e.target.value })}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px 10px',
                            fontSize: '11px',
                            fontFamily: 'var(--font-sans)',
                            lineHeight: 1.5,
                            border: '1px solid #111',
                            borderRadius: '2px',
                            background: '#ffffff',
                            resize: 'vertical',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '2px',
                            fontSize: '11px',
                            background: '#f8f9fa',
                            minHeight: '60px',
                            fontStyle: product.customerNotes ? 'normal' : 'italic',
                            color: product.customerNotes ? '#111' : 'var(--gray)',
                          }}
                        >
                          {product.customerNotes || 'No customer notes recorded.'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Product Page Footer Signatures & Page Number */}
              <div
                style={{
                  borderTop: '1px solid #e0e0e0',
                  paddingTop: '14px',
                  marginTop: '20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  fontSize: '10px',
                  color: 'var(--gray)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#111' }}>Reviewed By:</div>
                  <div style={{ marginTop: '22px', borderTop: '1px solid #111', width: '140px' }} />
                  <div style={{ marginTop: '2px' }}>Authorized Workshop Signatory</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div>Last Edited: {new Date().toLocaleDateString('en-IN', { dateStyle: 'short' })}</div>
                  <div style={{ fontWeight: 600 }}>Page {pageNum} of {totalPages}</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, textTransform: 'uppercase', color: '#111' }}>Client Approval:</div>
                  <div style={{ marginTop: '22px', borderTop: '1px solid #111', width: '140px', marginLeft: 'auto' }} />
                  <div style={{ marginTop: '2px' }}>Client Signature & Date</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* =========================================================================
          4. MICROSOFT WORD STATUS BAR (at the very bottom)
      ========================================================================= */}
      <div
        className="no-print"
        style={{
          background: '#2b579a',
          color: '#ffffff',
          padding: '4px 20px',
          fontSize: '11px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 -1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <div style={{ display: 'flex', gap: '16px' }}>
          <span>Page 1 of {totalPages}</span>
          <span>Orientation: {isPortrait ? 'A4 Portrait' : 'A4 Landscape'}</span>
          <span>Series: {doc.series}</span>
          <span>Review Sheet No.: {displaySheetNo}</span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span>Zoom: 100%</span>
          <span>Active Tool: {activeTool.toUpperCase()}</span>
          <span>Status: Ready</span>
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
