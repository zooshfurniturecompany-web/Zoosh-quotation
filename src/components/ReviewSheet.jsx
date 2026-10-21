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
import CropModal from './CropModal';
import { DEFAULT_ZOOSH_LOGO } from '../utils/logo';
import { exportSingleProductWord, exportFullReviewWord } from '../utils/wordExport';

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
  const [exportingWord, setExportingWord] = useState(false);
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
  const [cropTarget, setCropTarget] = useState(null); // { productId, imageType: 'primary' | 'additional', imageId, imageSrc }

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
          const baseline = {};
          (reviewDoc.products || []).forEach((p) => {
            baseline[p.id] = JSON.stringify({
              photo: p.photo,
              originalPhoto: p.originalPhoto,
              annotations: p.annotations,
              additionalImages: p.additionalImages,
              fabricSelections: p.fabricSelections,
              imageLocked: p.imageLocked,
              approvalStatus: p.approvalStatus,
            });
          });
          baselineProductsRef.current = baseline;
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

  // Track baseline saved state of products to increment productRevision independently
  const baselineProductsRef = useRef({});

  // Total Pages = 1 Title Page + 1 page per product + continuation pages for products with > 4 images
  const continuationPagesCount = products.reduce(
    (acc, p) => acc + ((p.additionalImages?.length || 0) > 4 ? 1 : 0),
    0
  );
  const totalPages = Math.max(1, 1 + products.length + continuationPagesCount);

  // Save changes to active review document with independent product revision incrementing
  const handleSaveActiveDoc = async (updatedDoc = doc) => {
    if (isViewingSnapshot) {
      addToast('Cannot modify historical snapshot. Switch to Active Document to make edits.', 'warning');
      return;
    }
    setSaving(true);
    try {
      // Evaluate if any products changed compared to baseline to independently increment productRevision
      const currentProducts = updatedDoc?.products || [];
      const updatedProducts = currentProducts.map((p) => {
        const currentHash = JSON.stringify({
          photo: p.photo,
          originalPhoto: p.originalPhoto,
          annotations: p.annotations,
          additionalImages: p.additionalImages,
          fabricSelections: p.fabricSelections,
          imageLocked: p.imageLocked,
          approvalStatus: p.approvalStatus,
        });
        const baselineHash = baselineProductsRef.current[p.id];
        if (baselineHash && currentHash !== baselineHash) {
          const currentRev = parseInt(p.productRevision || '0', 10);
          const nextRevStr = String(currentRev + 1).padStart(2, '0');
          return { ...p, productRevision: nextRevStr };
        }
        return p;
      });

      const docToSave = {
        ...updatedDoc,
        products: updatedProducts,
      };

      const saved = await saveReviewDocument(docToSave);
      setDoc(saved);

      // Update baseline after successful save
      const newBaseline = {};
      (saved.products || []).forEach((p) => {
        newBaseline[p.id] = JSON.stringify({
          photo: p.photo,
          originalPhoto: p.originalPhoto,
          annotations: p.annotations,
          additionalImages: p.additionalImages,
          fabricSelections: p.fabricSelections,
          imageLocked: p.imageLocked,
          approvalStatus: p.approvalStatus,
        });
      });
      baselineProductsRef.current = newBaseline;

      addToast('Review Sheet saved successfully', 'success');
    } catch (err) {
      console.error('Failed to save review sheet:', err);
      addToast('Error saving Review Sheet', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Word-like Undo / Redo engine with Ref persistence
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const lastTypingTimeRef = useRef(0);

  // Push state to undo stack before mutation
  const pushToUndo = (productsSnapshot) => {
    const toSave = productsSnapshot || docRef.current?.products;
    if (!toSave) return;
    const serialized = JSON.stringify(toSave);
    const stack = undoStackRef.current;
    
    // Avoid storing identical consecutive states
    if (stack.length > 0 && stack[stack.length - 1] === serialized) return;

    stack.push(serialized);
    if (stack.length > 50) {
      stack.shift();
    }
    redoStackRef.current = [];
    setUndoStack([...stack]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStackRef.current.length === 0 || isViewingSnapshot) return;
    const previousSerialized = undoStackRef.current.pop();
    if (docRef.current?.products) {
      redoStackRef.current.push(JSON.stringify(docRef.current.products));
      if (redoStackRef.current.length > 50) {
        redoStackRef.current.shift();
      }
    }
    setUndoStack([...undoStackRef.current]);
    setRedoStack([...redoStackRef.current]);

    try {
      const restoredProducts = JSON.parse(previousSerialized);
      setDoc((prev) => ({ ...prev, products: restoredProducts }));
      addToast('Undo (Ctrl+Z) applied', 'info');
    } catch (e) {
      console.error('Error applying undo:', e);
    }
  };

  const handleRedo = () => {
    if (redoStackRef.current.length === 0 || isViewingSnapshot) return;
    const nextSerialized = redoStackRef.current.pop();
    if (docRef.current?.products) {
      undoStackRef.current.push(JSON.stringify(docRef.current.products));
      if (undoStackRef.current.length > 50) {
        undoStackRef.current.shift();
      }
    }
    setUndoStack([...undoStackRef.current]);
    setRedoStack([...redoStackRef.current]);

    try {
      const restoredProducts = JSON.parse(nextSerialized);
      setDoc((prev) => ({ ...prev, products: restoredProducts }));
      addToast('Redo (Ctrl+Y) applied', 'info');
    } catch (e) {
      console.error('Error applying redo:', e);
    }
  };

  // Global Keyboard shortcuts: Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo), Ctrl+S (Save)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (isViewingSnapshot) return;

      const activeEl = document.activeElement;
      const tag = activeEl?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || activeEl?.isContentEditable;

      const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          if (e.shiftKey) {
            // Redo: Ctrl + Shift + Z
            if (!isTyping) {
              e.preventDefault();
              handleRedo();
            }
          } else {
            // Undo: Ctrl + Z
            if (!isTyping) {
              e.preventDefault();
              handleUndo();
            }
          }
        } else if (key === 'y') {
          // Redo: Ctrl + Y
          if (!isTyping) {
            e.preventDefault();
            handleRedo();
          }
        } else if (key === 's') {
          // Save: Ctrl + S
          e.preventDefault();
          if (docRef.current) {
            handleSaveActiveDoc(docRef.current);
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [isViewingSnapshot]);

  // Export all products to Microsoft Word (.docx)
  const handleExportAllWord = async () => {
    const targetDoc = displayedDoc || doc;
    if (!targetDoc) return;
    setExportingWord(true);
    addToast('Generating editable Microsoft Word document with high-res annotations...', 'info');
    try {
      await exportFullReviewWord(targetDoc, orientation);
      addToast('Downloaded complete Word Review Sheet (.docx)', 'success');
    } catch (err) {
      console.error('Word export failed:', err);
      addToast('Failed to export Word document: ' + err.message, 'error');
    } finally {
      setExportingWord(false);
    }
  };

  // Export a single product preview to Microsoft Word (.docx)
  const handleExportSingleProductWord = async (product, pIdx) => {
    const targetDoc = displayedDoc || doc;
    if (!targetDoc || !product) return;
    setExportingWord(true);
    addToast(`Generating editable Word document for "${product.name}"...`, 'info');
    try {
      await exportSingleProductWord(targetDoc, product, pIdx, orientation);
      addToast(`Downloaded "${product.name}" Word preview (.docx)`, 'success');
    } catch (err) {
      console.error('Word export failed:', err);
      addToast('Failed to export Word preview: ' + err.message, 'error');
    } finally {
      setExportingWord(false);
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
  const handleProductUpdate = (productId, updates, isTypingField = false) => {
    if (isViewingSnapshot) {
      addToast('Historical snapshots are read-only', 'warning');
      return;
    }
    if (isTypingField) {
      const now = Date.now();
      if (now - lastTypingTimeRef.current > 800) {
        pushToUndo(docRef.current?.products);
      }
      lastTypingTimeRef.current = now;
    } else {
      pushToUndo(docRef.current?.products);
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

  // Derive initials prefix from client name (Section 10: e.g. "Ravi Varma" -> "RVA")
  const getClientPrefix = (clientName) => {
    if (!clientName) return 'ZSH';
    const parts = clientName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0][0].toUpperCase();
      const lastWord = parts[parts.length - 1];
      const lastFirst = lastWord[0].toUpperCase();
      const lastEnd = lastWord[lastWord.length - 1].toUpperCase();
      return `${first}${lastFirst}${lastEnd}`;
    } else if (parts.length === 1 && parts[0].length >= 3) {
      const w = parts[0];
      return `${w[0]}${w[1]}${w[w.length - 1]}`.toUpperCase();
    }
    return 'ZSH';
  };

  // Toggle production approval and assign/revoke Product ID (Section 10)
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
      const prefix = getClientPrefix(doc?.client?.name);
      const seqNum = 140 + (product.itemIndex || 1) - 1;
      const newPid = `${prefix} ${seqNum}`;
      handleProductUpdate(product.id, {
        approvalStatus: 'Approved',
        productId: newPid,
        approvedBy: 'Production Manager',
        approvedAt: new Date().toISOString(),
      });
      addToast(`Approved "${product.name}" for production (${newPid})`, 'success');
    }
  };

  // Fabric selection table management (Reference Image 1: Sl. No., Part Name, Specification, Code, Reference Image, Qty, Remark)
  const handleAddFabricRow = (productId) => {
    if (isViewingSnapshot) return;
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;
    const currentRows = prod.fabricSelections || [];
    const newRow = {
      id: `fab-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      slNo: currentRows.length + 1,
      partName: currentRows.length === 0 ? 'Seating' : currentRows.length === 1 ? 'Back rest' : 'Pillow',
      specification: currentRows.length === 0 ? 'Sarom' : currentRows.length === 1 ? 'Fabio' : 'Am Fabric',
      code: currentRows.length === 0 ? '241' : currentRows.length === 1 ? '526' : '3622',
      refImage: null,
      qty: currentRows.length === 0 ? '6 mtr' : currentRows.length === 1 ? '5 mtr' : '2 mtr',
      remark: '',
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
    handleProductUpdate(productId, { fabricSelections: updated }, true);
  };

  const handleFabricSwatchUpload = (productId, rowId, file) => {
    if (!file || isViewingSnapshot) return;
    const reader = new FileReader();
    reader.onload = () => {
      handleFabricFieldChange(productId, rowId, 'refImage', reader.result);
      addToast('Uploaded fabric swatch thumbnail', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFabricRow = (productId, rowId) => {
    if (isViewingSnapshot) return;
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;
    handleProductUpdate(productId, {
      fabricSelections: (prod.fabricSelections || []).filter((r) => r.id !== rowId),
    });
  };

  // Client Remarks management (Reference Image 2 & Section 15/16)
  const handleAddClientRemark = (productId, text) => {
    if (isViewingSnapshot || !text.trim()) return;
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;
    const currentList = prod.clientRemarks || [];
    const currentRev = parseInt(prod.remarksRevision || '0', 10);
    const nextRevStr = String(currentRev + 1).padStart(2, '0');
    handleProductUpdate(productId, {
      clientRemarks: [...currentList, text.trim()],
      remarksRevision: nextRevStr,
    });
    addToast(`Added remark (Client Remarks Revision: ${nextRevStr})`, 'success');
  };

  const handleRemoveClientRemark = (productId, rIdx) => {
    if (isViewingSnapshot) return;
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;
    const currentList = prod.clientRemarks || [];
    handleProductUpdate(productId, {
      clientRemarks: currentList.filter((_, i) => i !== rIdx),
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
          originalUrl: null,
          label: `Picture - ${nextPicNum}`,
          caption: 'Production detail view',
          locked: false,
        };
        handleProductUpdate(productId, {
          additionalImages: [...(prod.additionalImages || []), newImg],
        });
        addToast(`Attached ${newImg.label}`, 'success');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleApplyCrop = (croppedDataUrl) => {
    if (!cropTarget) return;
    const { productId, imageType, imageId } = cropTarget;
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;

    if (imageType === 'primary') {
      handleProductUpdate(productId, {
        photo: croppedDataUrl,
        originalPhoto: prod.originalPhoto || prod.photo,
      });
      addToast('Applied crop to Reference Image', 'success');
    } else if (imageType === 'additional') {
      const updatedAddImgs = (prod.additionalImages || []).map((img) => {
        if (img.id === imageId) {
          return {
            ...img,
            url: croppedDataUrl,
            originalUrl: img.originalUrl || img.url,
          };
        }
        return img;
      });
      handleProductUpdate(productId, { additionalImages: updatedAddImgs });
      addToast('Applied crop to additional image', 'success');
    }
    setCropTarget(null);
  };

  const handleResetCrop = (productId, imageType, imageId) => {
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;

    if (imageType === 'primary' && prod.originalPhoto) {
      handleProductUpdate(productId, {
        photo: prod.originalPhoto,
        originalPhoto: null,
      });
      addToast('Restored original crop for Reference Image', 'success');
    } else if (imageType === 'additional') {
      const updatedAddImgs = (prod.additionalImages || []).map((img) => {
        if (img.id === imageId && img.originalUrl) {
          return {
            ...img,
            url: img.originalUrl,
            originalUrl: null,
          };
        }
        return img;
      });
      handleProductUpdate(productId, { additionalImages: updatedAddImgs });
      addToast('Restored original crop for additional image', 'success');
    }
  };

  const handleToggleImageLock = (productId, imageType, imageId) => {
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;

    if (imageType === 'primary') {
      handleProductUpdate(productId, { imageLocked: !prod.imageLocked });
    } else {
      const updated = (prod.additionalImages || []).map((img) => {
        if (img.id === imageId) {
          return { ...img, locked: !img.locked };
        }
        return img;
      });
      handleProductUpdate(productId, { additionalImages: updated });
    }
  };

  const handleRemoveAdditionalImage = (productId, imageId) => {
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;
    const remaining = (prod.additionalImages || []).filter((img) => img.id !== imageId);
    const renumbered = remaining.map((img, idx) => ({
      ...img,
      label: `Picture - ${idx + 2}`,
    }));
    handleProductUpdate(productId, { additionalImages: renumbered });
    addToast('Removed view and renumbered remaining images', 'info');
  };

  const handleReorderAdditionalImage = (productId, imgId, direction) => {
    if (isViewingSnapshot) return;
    const prod = doc.products.find((p) => p.id === productId);
    if (!prod) return;
    const list = [...(prod.additionalImages || [])];
    const idx = list.findIndex((img) => img.id === imgId);
    if (idx === -1) return;
    if (direction === 'prev' && idx > 0) {
      const temp = list[idx];
      list[idx] = list[idx - 1];
      list[idx - 1] = temp;
    } else if (direction === 'next' && idx < list.length - 1) {
      const temp = list[idx];
      list[idx] = list[idx + 1];
      list[idx + 1] = temp;
    } else {
      return;
    }
    const updated = list.map((img, i) => ({
      ...img,
      label: `Picture - ${i + 2}`,
    }));
    handleProductUpdate(productId, { additionalImages: updated });
    addToast('Reordered product views', 'info');
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

          <button
            type="button"
            onClick={handleExportAllWord}
            disabled={exportingWord}
            style={{
              background: '#107c41',
              color: '#ffffff',
              border: 'none',
              padding: '5px 14px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '3px',
              cursor: exportingWord ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title="Download editable Microsoft Word document (.docx) containing all product reviews"
          >
            <span>📄</span>
            <span>{exportingWord ? 'Exporting Word...' : 'Download Word (.docx)'}</span>
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
            {/* Boxed Header Container from Reference Image 3 */}
            <div
              style={{
                border: '1.5px solid #111111',
                padding: '28px 36px',
                marginBottom: '40px',
                background: '#ffffff',
              }}
            >
              {/* Centered Underlined Title */}
              <h1
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '24px',
                  fontWeight: 800,
                  textDecoration: 'underline',
                  textAlign: 'center',
                  margin: '0 0 28px',
                  color: '#111111',
                  letterSpacing: '0.02em',
                }}
              >
                Product Review Sheet
              </h1>

              {/* 2-Column Grid inside Box */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.2fr 1fr',
                  gap: '12px 32px',
                  fontSize: '13px',
                  lineHeight: 1.8,
                  color: '#111111',
                }}
              >
                {/* Left Column */}
                <div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <strong>Review on Quotation:</strong>
                    <span>{displaySourceQuote || `QTN-${doc.series}- 01`}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <strong>Client Name:</strong>
                    <span>{displayedDoc?.client?.name || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <strong>Contact No.:</strong>
                    <span>{displayedDoc?.client?.phone || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <strong>Place:</strong>
                    <span>{displayedDoc?.client?.addr || '—'}</span>
                  </div>
                </div>

                {/* Right Column */}
                <div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <strong>Review Sheet Revision -</strong>
                    <span>{displaySheetNo}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <strong>Submitted on:</strong>
                    <span>{new Date().toLocaleDateString('en-GB')}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <strong>Approved on:</strong>
                    <span>{displayedDoc?.approvedAt ? new Date(displayedDoc.approvedAt).toLocaleDateString('en-GB') : '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Exact 3-Paragraph Mandatory Notice from Reference Image 3 */}
            <div style={{ padding: '0 4px' }}>
              <h3
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  fontWeight: 700,
                  margin: '0 0 16px',
                  color: '#111111',
                }}
              >
                Important Note Regarding Your Furniture Order Specification
              </h3>

              <div style={{ fontSize: '12px', lineHeight: 1.8, color: '#222222', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <p style={{ margin: 0 }}>
                  Please review the product details listed below carefully. If you have any changes or suggestions, kindly add your notes directly to the respective items. Based on your feedback, we will finalize the quotation for your approval before starting production.
                </p>
                <p style={{ margin: 0 }}>
                  Please note that all production documents and drawings will be generated based entirely on this review note. Consequently, our factory cannot accept responsibility for any design or technical details not explicitly specified in this final revision.
                </p>
                <p style={{ margin: 0 }}>
                  Furthermore, this process confirms that no major changes will be made after approval. Any items kept pending for confirmation—with the exception of fabric selection—will not be scheduled for production. Kindly verify each detail to ensure every piece is manufactured precisely to your preference.
                </p>
              </div>
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
          const isApproved = product.approvalStatus === 'Approved';
          const pid = product.productId || (isApproved ? `PID-${doc.series}-${String(pIdx + 1).padStart(2, '0')}` : null);
          const additionalImgs = product.additionalImages || [];

          return (
            <React.Fragment key={product.id || pIdx}>
              <div
                className="word-page-sheet a4-page product-page"
              style={{
                width: a4PageWidth,
                minHeight: a4PageMinHeight,
                background: '#ffffff',
                boxShadow: '0 4px 18px rgba(0, 0, 0, 0.12)',
                border: '1px solid #d1d5db',
                borderRadius: '2px',
                padding: '24px 32px',
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                position: 'relative',
                pageBreakAfter: 'always',
              }}
            >
              {/* Top Compact Product Information Box (Exact Reference Image 2 Layout) */}
              <div
                style={{
                  border: '1.5px solid #111111',
                  padding: '10px 16px',
                  background: '#ffffff',
                  display: 'grid',
                  gridTemplateColumns: '1.3fr 1.2fr 1.1fr',
                  gap: '12px',
                  alignItems: 'center',
                  fontSize: '11px',
                  lineHeight: 1.5,
                }}
              >
                {/* Col 1: Sl. No. & ITEM */}
                <div>
                  <div><strong>Sl. No. :</strong> {pIdx + 1}</div>
                  <div style={{ marginTop: '2px' }}>
                    <strong>ITEM :</strong> <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{product.name}</span>
                  </div>
                </div>

                {/* Col 2: PRODUCT ID & QUANTITY */}
                <div>
                  <div>
                    <strong>PRODUCT ID :</strong>{' '}
                    {isApproved ? (
                      <span style={{ color: '#27ae60', fontWeight: 700 }}>
                        {pid}
                      </span>
                    ) : (
                      <span style={{ color: '#d97706', fontWeight: 600 }}>
                        PENDING APPROVAL
                      </span>
                    )}
                  </div>
                  <div style={{ marginTop: '2px' }}>
                    <strong>QUANTITY :</strong> {product.qty} {product.utype || 'nos'}
                  </div>
                </div>

                {/* Col 3: Product Revision & Action Controls */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div><strong>Product Rev :</strong> <span style={{ fontWeight: 700 }}>{product.productRevision || '00'}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                    {!isViewingSnapshot && (
                      <button
                        type="button"
                        className="no-print del-btn"
                        onClick={() => handleToggleApproval(product)}
                        style={{
                          borderColor: isApproved ? '#ff5555' : '#28a745',
                          color: isApproved ? '#ff5555' : '#28a745',
                          fontSize: '10px',
                          padding: '2px 8px',
                        }}
                      >
                        {isApproved ? 'Revoke Approval' : '✓ Approve'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="no-print"
                      onClick={() => handleExportSingleProductWord(product, pIdx)}
                      disabled={exportingWord}
                      style={{
                        background: '#107c41',
                        color: '#ffffff',
                        border: 'none',
                        fontSize: '10px',
                        fontWeight: 600,
                        padding: '3px 8px',
                        borderRadius: '2px',
                        cursor: exportingWord ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}
                      title={`Download editable Microsoft Word document (.docx) for ${product.name}`}
                    >
                      <span>📥</span>
                      <span>Word (.docx)</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Main Product Layout: Left Workspace + Right Client Remarks Column */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isPortrait ? '1fr' : '1fr 240px',
                  gap: '18px',
                  alignItems: 'stretch',
                  flex: 1,
                }}
              >
                {/* =========================================================
                    LEFT SECTION: Primary Image Workspace, Additional Views, Fabric Table
                ========================================================= */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Primary Reference Image Workspace & Additional Images Grid (Section 4) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {additionalImgs.length === 0 ? (
                      /* 1 Single Primary Image (Dominant full-width card) */
                      <div
                        style={{
                          position: 'relative',
                          border: '1.5px solid #111111',
                          background: '#ffffff',
                          height: isPortrait ? '360px' : '410px',
                          width: '100%',
                          boxSizing: 'border-box',
                        }}
                      >
                        {/* Header Badges & Controls */}
                        <div
                          style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            right: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            zIndex: 20,
                            pointerEvents: 'none',
                          }}
                        >
                          <div
                            style={{
                              background: '#e3f2fd',
                              border: '1px solid #90caf9',
                              padding: '3px 8px',
                              fontSize: '10px',
                              fontWeight: 800,
                              color: '#1565c0',
                              borderRadius: '2px',
                              letterSpacing: '0.04em',
                              pointerEvents: 'auto',
                            }}
                          >
                            Reference Image
                          </div>

                          <div style={{ display: 'flex', gap: '5px', pointerEvents: 'auto' }} className="no-print">
                            {product.originalPhoto && (
                              <button
                                type="button"
                                onClick={() => handleResetCrop(product.id, 'primary')}
                                style={{ background: '#fff', border: '1px solid #ccc', padding: '2px 6px', fontSize: '9px', cursor: 'pointer', borderRadius: '2px' }}
                                title="Reset to original uncropped image"
                              >
                                ↺ Reset Crop
                              </button>
                            )}
                            {!isViewingSnapshot && (
                              <button
                                type="button"
                                onClick={() => setCropTarget({ productId: product.id, imageType: 'primary', imageSrc: product.originalPhoto || product.photo })}
                                style={{ background: '#fff', border: '1px solid #ccc', padding: '2px 6px', fontSize: '9px', cursor: 'pointer', borderRadius: '2px' }}
                                title="Crop Reference Image"
                              >
                                ✂️ Crop
                              </button>
                            )}
                            {!isViewingSnapshot && (
                              <button
                                type="button"
                                onClick={() => handleToggleImageLock(product.id, 'primary')}
                                style={{
                                  background: product.imageLocked ? '#111' : '#fff',
                                  color: product.imageLocked ? '#fff' : '#111',
                                  border: '1px solid #ccc',
                                  padding: '2px 6px',
                                  fontSize: '9px',
                                  cursor: 'pointer',
                                  borderRadius: '2px',
                                }}
                              >
                                {product.imageLocked ? '🔒 Locked' : '🔓 Lock'}
                              </button>
                            )}
                          </div>
                        </div>

                        <div style={{ width: '100%', height: '100%' }}>
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
                      </div>
                    ) : (
                      /* Image Grid: Primary Reference Image dominant on Left, Additional Views on Right */
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: isPortrait ? '1fr' : (additionalImgs.length === 1 ? '6fr 4fr' : '5.8fr 4.2fr'),
                          gap: '10px',
                          alignItems: 'stretch',
                        }}
                      >
                        {/* Dominant Primary Reference Image */}
                        <div
                          style={{
                            position: 'relative',
                            border: '1.5px solid #111111',
                            background: '#ffffff',
                            height: isPortrait ? '320px' : '390px',
                            boxSizing: 'border-box',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: '8px',
                              left: '8px',
                              right: '8px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              zIndex: 20,
                              pointerEvents: 'none',
                            }}
                          >
                            <div
                              style={{
                                background: '#e3f2fd',
                                border: '1px solid #90caf9',
                                padding: '3px 8px',
                                fontSize: '10px',
                                fontWeight: 800,
                                color: '#1565c0',
                                borderRadius: '2px',
                                letterSpacing: '0.04em',
                                pointerEvents: 'auto',
                              }}
                            >
                              Reference Image
                            </div>

                            <div style={{ display: 'flex', gap: '4px', pointerEvents: 'auto' }} className="no-print">
                              {product.originalPhoto && (
                                <button
                                  type="button"
                                  onClick={() => handleResetCrop(product.id, 'primary')}
                                  style={{ background: '#fff', border: '1px solid #ccc', padding: '2px 5px', fontSize: '9px', cursor: 'pointer', borderRadius: '2px' }}
                                  title="Reset crop"
                                >
                                  ↺ Reset
                                </button>
                              )}
                              {!isViewingSnapshot && (
                                <button
                                  type="button"
                                  onClick={() => setCropTarget({ productId: product.id, imageType: 'primary', imageSrc: product.originalPhoto || product.photo })}
                                  style={{ background: '#fff', border: '1px solid #ccc', padding: '2px 5px', fontSize: '9px', cursor: 'pointer', borderRadius: '2px' }}
                                  title="Crop"
                                >
                                  ✂️ Crop
                                </button>
                              )}
                              {!isViewingSnapshot && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleImageLock(product.id, 'primary')}
                                  style={{
                                    background: product.imageLocked ? '#111' : '#fff',
                                    color: product.imageLocked ? '#fff' : '#111',
                                    border: '1px solid #ccc',
                                    padding: '2px 5px',
                                    fontSize: '9px',
                                    cursor: 'pointer',
                                    borderRadius: '2px',
                                  }}
                                >
                                  {product.imageLocked ? '🔒' : '🔓'}
                                </button>
                              )}
                            </div>
                          </div>

                          <div style={{ width: '100%', height: '100%' }}>
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
                        </div>

                        {/* Additional Images Cells (Up to 4 images on Page 1, subsequent on Continuation Page) */}
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: additionalImgs.length > 2 ? '1fr 1fr' : '1fr',
                            gap: '8px',
                            alignContent: 'start',
                          }}
                        >
                          {additionalImgs.slice(0, 4).map((img, addIdx) => (
                            <div
                              key={img.id}
                              style={{
                                position: 'relative',
                                border: '1px solid #bbb',
                                background: '#ffffff',
                                height: additionalImgs.length === 1 ? '390px' : '190px',
                                display: 'flex',
                                flexDirection: 'column',
                                boxSizing: 'border-box',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  padding: '4px 8px',
                                  background: '#f1f3f5',
                                  borderBottom: '1px solid #ddd',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  color: '#333',
                                }}
                              >
                                <span>{img.label || `Picture - ${addIdx + 2}`}</span>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} className="no-print">
                                  {!img.locked && !isViewingSnapshot && (
                                    <>
                                      {addIdx > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => handleReorderAdditionalImage(product.id, img.id, 'prev')}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', padding: 0 }}
                                          title="Move view earlier"
                                        >
                                          ◀
                                        </button>
                                      )}
                                      {addIdx < additionalImgs.length - 1 && (
                                        <button
                                          type="button"
                                          onClick={() => handleReorderAdditionalImage(product.id, img.id, 'next')}
                                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', padding: 0 }}
                                          title="Move view later"
                                        >
                                          ▶
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {img.originalUrl && (
                                    <button
                                      type="button"
                                      onClick={() => handleResetCrop(product.id, 'additional', img.id)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', padding: 0 }}
                                      title="Reset crop"
                                    >
                                      ↺
                                    </button>
                                  )}
                                  {!isViewingSnapshot && !img.locked && (
                                    <button
                                      type="button"
                                      onClick={() => setCropTarget({ productId: product.id, imageType: 'additional', imageId: img.id, imageSrc: img.originalUrl || img.url })}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', padding: 0 }}
                                      title="Crop"
                                    >
                                      ✂️
                                    </button>
                                  )}
                                  {!isViewingSnapshot && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleImageLock(product.id, 'additional', img.id)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', padding: 0 }}
                                      title={img.locked ? 'Locked' : 'Unlocked'}
                                    >
                                      {img.locked ? '🔒' : '🔓'}
                                    </button>
                                  )}
                                  {!isViewingSnapshot && !img.locked && (
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAdditionalImage(product.id, img.id)}
                                      style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                                      title="Remove view"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', padding: '4px' }}>
                                <img
                                  src={img.url}
                                  alt={img.label}
                                  style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    display: 'block',
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Upload New Additional Image control (Hidden in print) */}
                    {!isViewingSnapshot && (
                      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '2px' }}>
                        <label
                          style={{
                            fontSize: '10px',
                            color: '#2b579a',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          + Upload Additional Image (Picture - {additionalImgs.length + 2})
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

                  {/* Selected Fabric Details Table (Exact Reference Image 1 Layout) */}
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
                          fontSize: '10px',
                          color: 'var(--gray)',
                          fontStyle: 'italic',
                          padding: '10px',
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
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', border: '1px solid #111' }}>
                          <thead>
                            <tr style={{ background: '#f8f9fa', borderBottom: '1.5px solid #111' }}>
                              <th style={{ padding: '6px 4px', textAlign: 'center', width: '32px', borderRight: '1px solid #111' }}>Sl. No.</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', borderRight: '1px solid #111' }}>Part Name</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', borderRight: '1px solid #111' }}>Specification</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', borderRight: '1px solid #111' }}>Code</th>
                              <th style={{ padding: '6px 8px', textAlign: 'center', width: '90px', borderRight: '1px solid #111' }}>Reference Image</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', width: '60px', borderRight: '1px solid #111' }}>Qty</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left' }}>Remark</th>
                              {!isViewingSnapshot && <th className="no-print" style={{ width: '20px' }}></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {product.fabricSelections.map((fab, fIdx) => (
                              <tr key={fab.id || fIdx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '6px 4px', textAlign: 'center', fontWeight: 600, borderRight: '1px solid #e5e7eb' }}>{fIdx + 1}</td>
                                <td style={{ padding: '4px 6px', borderRight: '1px solid #e5e7eb' }}>
                                  {!isViewingSnapshot ? (
                                    <input
                                      className="inp"
                                      style={{ padding: '2px 4px', fontSize: '10px' }}
                                      value={fab.partName || ''}
                                      placeholder="e.g. Seating"
                                      onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'partName', e.target.value)}
                                    />
                                  ) : (
                                    fab.partName || '—'
                                  )}
                                </td>
                                <td style={{ padding: '4px 6px', borderRight: '1px solid #e5e7eb' }}>
                                  {!isViewingSnapshot ? (
                                    <input
                                      className="inp"
                                      style={{ padding: '2px 4px', fontSize: '10px' }}
                                      value={fab.specification || fab.brand || ''}
                                      placeholder="e.g. Sarom"
                                      onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'specification', e.target.value)}
                                    />
                                  ) : (
                                    fab.specification || fab.brand || '—'
                                  )}
                                </td>
                                <td style={{ padding: '4px 6px', borderRight: '1px solid #e5e7eb' }}>
                                  {!isViewingSnapshot ? (
                                    <input
                                      className="inp"
                                      style={{ padding: '2px 4px', fontSize: '10px' }}
                                      value={fab.code || fab.catalogueCode || ''}
                                      placeholder="e.g. 241"
                                      onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'code', e.target.value)}
                                    />
                                  ) : (
                                    fab.code || fab.catalogueCode || '—'
                                  )}
                                </td>
                                <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid #e5e7eb' }}>
                                  {fab.refImage ? (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <img
                                        src={fab.refImage}
                                        alt="Swatch"
                                        style={{ width: '44px', height: '30px', objectFit: 'cover', border: '1px solid #ccc', borderRadius: '1px' }}
                                      />
                                      {!isViewingSnapshot && (
                                        <button
                                          type="button"
                                          className="no-print"
                                          onClick={() => handleFabricFieldChange(product.id, fab.id, 'refImage', null)}
                                          style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', fontSize: '9px' }}
                                          title="Remove swatch"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    !isViewingSnapshot ? (
                                      <label style={{ fontSize: '9px', color: '#2b579a', cursor: 'pointer', textDecoration: 'underline' }}>
                                        📷 Upload
                                        <input
                                          type="file"
                                          accept="image/*"
                                          style={{ display: 'none' }}
                                          onChange={(e) => handleFabricSwatchUpload(product.id, fab.id, e.target.files?.[0])}
                                        />
                                      </label>
                                    ) : (
                                      <span style={{ color: '#aaa', fontSize: '9px' }}>None</span>
                                    )
                                  )}
                                </td>
                                <td style={{ padding: '4px 6px', borderRight: '1px solid #e5e7eb' }}>
                                  {!isViewingSnapshot ? (
                                    <input
                                      className="inp"
                                      style={{ padding: '2px 4px', fontSize: '10px', width: '45px' }}
                                      value={fab.qty || fab.totalMeter || ''}
                                      placeholder="e.g. 6 mtr"
                                      onChange={(e) => handleFabricFieldChange(product.id, fab.id, 'qty', e.target.value)}
                                    />
                                  ) : (
                                    fab.qty || fab.totalMeter || '—'
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
                </div>

                {/* =========================================================
                    RIGHT SECTION: Dedicated Fixed-Width CLIENT REMARKS Column (Reference Image 2)
                ========================================================= */}
                <div
                  style={{
                    borderLeft: '1.5px solid #111111',
                    paddingLeft: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                    <h3
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '13px',
                        fontWeight: 800,
                        textDecoration: 'underline',
                        textTransform: 'uppercase',
                        margin: '0 0 4px',
                        letterSpacing: '0.04em',
                        color: '#111111',
                      }}
                    >
                      CLIENT REMARKS
                    </h3>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        textDecoration: 'underline',
                        color: '#111111',
                      }}
                    >
                      Revision : {product.remarksRevision || '00'}
                    </div>
                  </div>

                  {/* Numbered List of Client Remarks (Reference Image 2) */}
                  <ol
                    style={{
                      margin: '0 0 16px',
                      paddingLeft: '18px',
                      fontSize: '11px',
                      lineHeight: 1.8,
                      color: '#111111',
                      flex: 1,
                    }}
                  >
                    {(product.clientRemarks && product.clientRemarks.length > 0) ? (
                      product.clientRemarks.map((rem, rIdx) => (
                        <li key={rIdx} style={{ marginBottom: '6px' }}>
                          <span>{rem}</span>
                          {!isViewingSnapshot && (
                            <button
                              type="button"
                              className="no-print"
                              onClick={() => handleRemoveClientRemark(product.id, rIdx)}
                              style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', marginLeft: '6px', fontSize: '10px' }}
                              title="Remove remark"
                            >
                              ✕
                            </button>
                          )}
                        </li>
                      ))
                    ) : (
                      <li style={{ fontStyle: 'italic', color: '#888' }}>
                        No client remarks recorded.
                      </li>
                    )}
                  </ol>

                  {/* Add Client Remark Field (hidden on print) */}
                  {!isViewingSnapshot && (
                    <div className="no-print" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '10px' }}>
                      <input
                        placeholder="+ Add client remark..."
                        className="inp"
                        style={{ width: '100%', fontSize: '10px', padding: '4px 6px', boxSizing: 'border-box' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.target.value.trim()) {
                            handleAddClientRemark(product.id, e.target.value);
                            e.target.value = '';
                          }
                        }}
                      />
                      <div style={{ fontSize: '9px', color: '#888', marginTop: '3px' }}>
                        Press Enter to save remark (increments Remarks Rev)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Continuation Page for same product when it has > 4 additional images */}
            {additionalImgs.length > 4 && (
              <div
                className="word-page-sheet a4-page product-page continuation-page"
                style={{
                  width: a4PageWidth,
                  minHeight: a4PageMinHeight,
                  background: '#ffffff',
                  boxShadow: '0 4px 18px rgba(0, 0, 0, 0.12)',
                  border: '1px solid #d1d5db',
                  borderRadius: '2px',
                  padding: '24px 32px',
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  position: 'relative',
                  pageBreakAfter: 'always',
                }}
              >
                {/* Top Compact Bar (Continuation Page) */}
                <div
                  style={{
                    border: '1.5px solid #111111',
                    padding: '10px 16px',
                    background: '#ffffff',
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 1.1fr 1.1fr',
                    gap: '12px',
                    alignItems: 'center',
                    fontSize: '11px',
                    lineHeight: 1.5,
                  }}
                >
                  <div>
                    <div><strong>Sl. No. :</strong> {pIdx + 1}</div>
                    <div style={{ marginTop: '2px' }}>
                      <strong>ITEM :</strong> <span style={{ textTransform: 'uppercase', fontWeight: 700 }}>{product.name}</span>
                      <span style={{ marginLeft: '6px', fontSize: '10px', color: '#1565c0', fontWeight: 700 }}>(CONTINUATION PAGE)</span>
                    </div>
                  </div>
                  <div>
                    <div>
                      <strong>PRODUCT ID :</strong>{' '}
                      {isApproved ? (
                        <span style={{ color: '#27ae60', fontWeight: 700 }}>{pid}</span>
                      ) : (
                        <span style={{ color: '#d97706', fontWeight: 600 }}>PENDING APPROVAL</span>
                      )}
                    </div>
                    <div style={{ marginTop: '2px' }}>
                      <strong>QUANTITY :</strong> {product.qty} {product.utype || 'nos'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div><strong>Product Rev :</strong> <span style={{ fontWeight: 700 }}>{product.productRevision || '00'}</span></div>
                    <div style={{ fontSize: '10px', color: '#555' }}>Additional Views Grid</div>
                  </div>
                </div>

                {/* Continuation Image Grid: 2 columns with large, readable cells */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isPortrait ? '1fr' : 'repeat(2, 1fr)',
                    gap: '12px',
                    alignContent: 'start',
                    flex: 1,
                  }}
                >
                  {additionalImgs.slice(4).map((img, addIdx) => {
                    const trueIdx = addIdx + 4;
                    return (
                      <div
                        key={img.id}
                        style={{
                          position: 'relative',
                          border: '1px solid #bbb',
                          background: '#ffffff',
                          height: isPortrait ? '260px' : '310px',
                          display: 'flex',
                          flexDirection: 'column',
                          boxSizing: 'border-box',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            padding: '4px 8px',
                            background: '#f1f3f5',
                            borderBottom: '1px solid #ddd',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '10px',
                            fontWeight: 700,
                            color: '#333',
                          }}
                        >
                          <span>{img.label || `Picture - ${trueIdx + 2}`}</span>
                          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} className="no-print">
                            {!img.locked && !isViewingSnapshot && (
                              <>
                                {trueIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleReorderAdditionalImage(product.id, img.id, 'prev')}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', padding: 0 }}
                                    title="Move view earlier"
                                  >
                                    ◀
                                  </button>
                                )}
                                {trueIdx < additionalImgs.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handleReorderAdditionalImage(product.id, img.id, 'next')}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', padding: 0 }}
                                    title="Move view later"
                                  >
                                    ▶
                                  </button>
                                )}
                              </>
                            )}
                            {img.originalUrl && (
                              <button
                                type="button"
                                onClick={() => handleResetCrop(product.id, 'additional', img.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', padding: 0 }}
                                title="Reset crop"
                              >
                                ↺
                              </button>
                            )}
                            {!isViewingSnapshot && !img.locked && (
                              <button
                                type="button"
                                onClick={() => setCropTarget({ productId: product.id, imageType: 'additional', imageId: img.id, imageSrc: img.originalUrl || img.url })}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', padding: 0 }}
                                title="Crop"
                              >
                                ✂️
                              </button>
                            )}
                            {!isViewingSnapshot && (
                              <button
                                type="button"
                                onClick={() => handleToggleImageLock(product.id, 'additional', img.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '9px', padding: 0 }}
                                title={img.locked ? 'Locked' : 'Unlocked'}
                              >
                                {img.locked ? '🔒' : '🔓'}
                              </button>
                            )}
                            {!isViewingSnapshot && !img.locked && (
                              <button
                                type="button"
                                onClick={() => handleRemoveAdditionalImage(product.id, img.id)}
                                style={{ background: 'none', border: 'none', color: '#ff5555', cursor: 'pointer', fontSize: '11px', padding: 0 }}
                                title="Remove view"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>

                        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa', padding: '6px' }}>
                          <img
                            src={img.url}
                            alt={img.label}
                            style={{
                              maxWidth: '100%',
                              maxHeight: '100%',
                              objectFit: 'contain',
                              display: 'block',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </React.Fragment>
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

      {/* Optional Intentional Crop Modal (Section 4.4) */}
      {cropTarget && (
        <CropModal
          imageSrc={cropTarget.imageSrc}
          onApply={handleApplyCrop}
          onClose={() => setCropTarget(null)}
        />
      )}
    </div>
  );
}
