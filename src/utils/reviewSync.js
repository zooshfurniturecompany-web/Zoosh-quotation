import { parseQuotationSeries, saveReviewDocument } from './reviewStorage.js';

/**
 * Normalizes string for reliable comparison
 */
function normStr(str) {
  return (str || '').trim();
}

/**
 * Normalizes image representation for comparison
 */
function normImg(img) {
  if (!img) return '';
  return img.trim();
}

/**
 * Compares quotation revision items with current review document products.
 * Implements Cases A through F from Section 6.
 *
 * @param {Object} currentDoc - Existing Review Document
 * @param {Object} newQuote - Incoming Quotation Revision
 * @returns {Object} { hasChanges, diffSummary, updatedProducts, supersededToArchive }
 */
export function detectQuotationChanges(currentDoc, newQuote) {
  const quoteItems = newQuote.items || [];
  const itemData = newQuote.itemData || {};
  const itemPhotos = newQuote.itemPhotos || {};

  const existingProducts = currentDoc.products || [];
  
  // Track matching
  const matchedExistingIds = new Set();
  const diffSummary = {
    unchanged: [],
    qtyUpdated: [],
    changedImages: [],
    changedSpecs: [],
    added: [],
    removed: [],
    details: [],
  };

  const updatedProducts = [];
  const supersededToArchive = [];

  // Iterate over quotation items in their exact latest quotation order
  quoteItems.forEach((itemId, idx) => {
    const qData = itemData[itemId] || {};
    const qName = normStr(qData.name) || `Product ${idx + 1}`;
    const qSpec = normStr(qData.spec);
    const qQty = qData.qty !== undefined && qData.qty !== '' ? String(qData.qty) : '1';
    const qUtype = qData.utype || 'nos';
    const qUnit = qData.unit || '';
    const qPhoto = normImg(itemPhotos[itemId]);

    // Attempt to match with existing product:
    // 1. By sourceItemId
    // 2. By exact name match (if not already matched)
    let existingMatch = existingProducts.find(
      (p) => !matchedExistingIds.has(p.id) && String(p.sourceItemId) === String(itemId)
    );

    if (!existingMatch) {
      existingMatch = existingProducts.find(
        (p) => !matchedExistingIds.has(p.id) && normStr(p.name).toLowerCase() === qName.toLowerCase()
      );
    }

    if (!existingMatch) {
      // Case F: New product added
      const newProduct = {
        id: `rev-item-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
        sourceItemId: itemId,
        itemIndex: idx + 1,
        name: qName,
        spec: qSpec,
        qty: qQty,
        utype: qUtype,
        unitPrice: qUnit,
        photo: qPhoto,
        annotations: [],
        additionalImages: [],
        imageLocked: false,
        customerNotes: '',
        fabricSelections: [],
        productId: null, // Requires production approval
        approvalStatus: 'Pending',
        approvedBy: '',
        approvedAt: null,
        version: 1,
      };

      updatedProducts.push(newProduct);
      diffSummary.added.push(qName);
      diffSummary.details.push(`New product added: "${qName}" (${qQty} ${qUtype})`);
    } else {
      matchedExistingIds.add(existingMatch.id);

      const isNameSame = normStr(existingMatch.name) === qName;
      const isSpecSame = normStr(existingMatch.spec) === qSpec;
      const isImgSame = normImg(existingMatch.photo) === qPhoto;
      const isQtySame = String(existingMatch.qty) === qQty && existingMatch.utype === qUtype;

      if (isNameSame && isSpecSame && isImgSame && isQtySame) {
        // Case A: Product completely unchanged
        // Preserve all annotations, dimension lines, additional images, fabric selections, Product ID, approval history
        updatedProducts.push({
          ...existingMatch,
          sourceItemId: itemId,
          itemIndex: idx + 1,
          unitPrice: qUnit,
        });
        diffSummary.unchanged.push(qName);
      } else if (isNameSame && isSpecSame && isImgSame && !isQtySame) {
        // Case B: Quantity-only change
        // Update quantity in place, preserve all annotations, notes, images, fabric, approval, Product ID
        const prevQty = existingMatch.qty;
        updatedProducts.push({
          ...existingMatch,
          sourceItemId: itemId,
          itemIndex: idx + 1,
          qty: qQty,
          utype: qUtype,
          unitPrice: qUnit,
        });
        diffSummary.qtyUpdated.push({ name: qName, oldQty: prevQty, newQty: qQty });
        diffSummary.details.push(`Quantity updated for "${qName}": ${prevQty} → ${qQty} ${qUtype}`);
      } else if (!isImgSame) {
        // Case C: Product image changed
        // Treat as changed version. Archive superseded version.
        // Do NOT transfer old annotations onto new image.
        supersededToArchive.push({
          ...existingMatch,
          supersededAt: new Date().toISOString(),
          supersededByQuote: newQuote.no,
          reason: 'Quotation reference image changed',
        });

        const newVersionProduct = {
          id: `rev-item-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
          sourceItemId: itemId,
          itemIndex: idx + 1,
          name: qName,
          spec: qSpec,
          qty: qQty,
          utype: qUtype,
          unitPrice: qUnit,
          photo: qPhoto,
          annotations: [], // Fresh annotations required for new image
          additionalImages: existingMatch.additionalImages || [],
          imageLocked: false,
          customerNotes: existingMatch.customerNotes || '',
          fabricSelections: existingMatch.fabricSelections || [],
          productId: null, // Requires re-approval
          approvalStatus: 'Pending',
          approvedBy: '',
          approvedAt: null,
          version: (existingMatch.version || 1) + 1,
        };

        updatedProducts.push(newVersionProduct);
        diffSummary.changedImages.push(qName);
        diffSummary.details.push(`Reference image changed for "${qName}". Superseded version archived.`);
      } else {
        // Case D: Product specifications or design changed
        // Treat as new active version. Archive superseded version.
        supersededToArchive.push({
          ...existingMatch,
          supersededAt: new Date().toISOString(),
          supersededByQuote: newQuote.no,
          reason: 'Specifications or design changed',
        });

        const newVersionProduct = {
          id: `rev-item-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
          sourceItemId: itemId,
          itemIndex: idx + 1,
          name: qName,
          spec: qSpec,
          qty: qQty,
          utype: qUtype,
          unitPrice: qUnit,
          photo: qPhoto,
          annotations: [],
          additionalImages: existingMatch.additionalImages || [],
          imageLocked: false,
          customerNotes: existingMatch.customerNotes || '',
          fabricSelections: existingMatch.fabricSelections || [],
          productId: null,
          approvalStatus: 'Pending',
          approvedBy: '',
          approvedAt: null,
          version: (existingMatch.version || 1) + 1,
        };

        updatedProducts.push(newVersionProduct);
        diffSummary.changedSpecs.push(qName);
        diffSummary.details.push(`Specifications changed for "${qName}". Superseded version archived.`);
      }
    }
  });

  // Check for Case E: Products removed from quotation
  existingProducts.forEach((prod) => {
    if (!matchedExistingIds.has(prod.id)) {
      supersededToArchive.push({
        ...prod,
        supersededAt: new Date().toISOString(),
        supersededByQuote: newQuote.no,
        reason: 'Removed from latest quotation revision',
      });
      diffSummary.removed.push(prod.name);
      diffSummary.details.push(`Product removed from quotation: "${prod.name}"`);
    }
  });

  // Determine if there are actual changes
  const hasChanges =
    diffSummary.added.length > 0 ||
    diffSummary.removed.length > 0 ||
    diffSummary.changedImages.length > 0 ||
    diffSummary.changedSpecs.length > 0 ||
    diffSummary.qtyUpdated.length > 0 ||
    currentDoc.latestQuotationNo !== newQuote.no;

  return {
    hasChanges,
    diffSummary,
    updatedProducts,
    supersededToArchive,
  };
}

/**
 * Synchronizes the Review document with a quotation revision transactionally.
 * Implements Section 4 (atomic sequence & snapshots), Section 5 & Section 9.
 */
export async function synchronizeReviewDocument(currentDoc, newQuote, user = 'Administrator') {
  if (!currentDoc || !currentDoc.series) {
    throw new Error('Invalid Review Document provided for synchronization.');
  }

  const parsed = parseQuotationSeries(newQuote.no);
  if (!parsed.valid) {
    throw new Error(parsed.error);
  }

  if (parsed.series !== currentDoc.series) {
    throw new Error(
      `Series mismatch: Review document belongs to series ${currentDoc.series}, but quotation belongs to series ${parsed.series}.`
    );
  }

  // Detect differences
  const { hasChanges, diffSummary, updatedProducts, supersededToArchive } =
    detectQuotationChanges(currentDoc, newQuote);

  // Section 4 & Section 11 (Rule 12):
  // "A quotation revision that produces no changes to the Review document must not increment the number."
  if (!hasChanges) {
    return {
      success: true,
      hasChanges: false,
      message: `Quotation ${newQuote.no} is already synchronized with Review Sheet No. ${currentDoc.sheetNoFormatted}. No changes detected.`,
      doc: currentDoc,
    };
  }

  const now = new Date().toISOString();
  const nextSheetNo = (currentDoc.currentSheetNo || 1) + 1;
  const nextSheetNoFormatted = String(nextSheetNo).padStart(2, '0');

  // Build summary text
  const changeParts = [];
  if (diffSummary.added.length) changeParts.push(`+${diffSummary.added.length} added`);
  if (diffSummary.removed.length) changeParts.push(`-${diffSummary.removed.length} removed`);
  if (diffSummary.qtyUpdated.length) changeParts.push(`${diffSummary.qtyUpdated.length} qty updated`);
  if (diffSummary.changedImages.length) changeParts.push(`${diffSummary.changedImages.length} images changed`);
  if (diffSummary.changedSpecs.length) changeParts.push(`${diffSummary.changedSpecs.length} specs changed`);
  const summaryText = changeParts.length > 0
    ? `Synchronized with ${newQuote.no}: ${changeParts.join(', ')}.`
    : `Synchronized with quotation revision ${newQuote.no}.`;

  const historyEntry = {
    id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    sheetNo: nextSheetNo,
    sheetNoFormatted: nextSheetNoFormatted,
    sourceQuotationNo: newQuote.no,
    timestamp: now,
    user,
    summary: summaryText,
    changes: {
      added: diffSummary.added.length,
      removed: diffSummary.removed.length,
      changed: diffSummary.changedImages.length + diffSummary.changedSpecs.length,
      qtyUpdated: diffSummary.qtyUpdated.length,
      details: diffSummary.details,
    },
    status: 'Success',
  };

  // Section 7: Save immutable snapshot of the new version
  const newSnapshot = {
    sheetNo: nextSheetNo,
    sheetNoFormatted: nextSheetNoFormatted,
    sourceQuotationNo: newQuote.no,
    timestamp: now,
    products: JSON.parse(JSON.stringify(updatedProducts)),
    client: newQuote.client ? { ...newQuote.client } : { ...currentDoc.client },
    company: newQuote.company ? { ...newQuote.company } : { ...currentDoc.company },
    createdAt: now,
  };

  const updatedDoc = {
    ...currentDoc,
    currentSheetNo: nextSheetNo,
    sheetNoFormatted: nextSheetNoFormatted,
    displayTitle: `QTN-${currentDoc.series} / REVIEW SHEET NO.: ${nextSheetNoFormatted}`,
    latestQuotationNo: newQuote.no,
    sourceRevision: parsed.revisionNum,
    updatedAt: now,
    client: newQuote.client ? { ...newQuote.client } : currentDoc.client,
    company: newQuote.company ? { ...newQuote.company } : currentDoc.company,
    products: updatedProducts,
    archivedProducts: [
      ...(currentDoc.archivedProducts || []),
      ...supersededToArchive,
    ],
    history: [historyEntry, ...(currentDoc.history || [])],
    snapshots: {
      ...(currentDoc.snapshots || {}),
      [nextSheetNo]: newSnapshot,
    },
  };

  const saved = await saveReviewDocument(updatedDoc);

  return {
    success: true,
    hasChanges: true,
    message: `Successfully synchronized with ${newQuote.no}. Advanced to Review Sheet No. ${nextSheetNoFormatted}.`,
    doc: saved,
  };
}
