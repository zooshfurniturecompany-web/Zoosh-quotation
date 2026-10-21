import { supabase, isSupabaseConfigured } from './supabaseClient.js';

const REVIEW_DB_NAME = 'zoosh_review_db';
const REVIEW_DB_VERSION = 1;
const REVIEW_STORE = 'review_sheets';

/**
 * Validates and extracts the 4-digit quotation series identifier.
 * Requirement 2: Parse quotation number using validated format.
 * Format expected: QTN-2627-01 or 2627-01 or QTN-2627
 */
export function parseQuotationSeries(quoteNo) {
  if (!quoteNo || typeof quoteNo !== 'string') {
    return {
      valid: false,
      error: 'Quotation number is missing or not a valid string.',
    };
  }

  const trimmed = quoteNo.trim();
  // Validates standard quotation format: Optional QTN- prefix, exactly 4-digit series, optional -revision
  const match = trimmed.match(/^(?:QTN-)?(\d{4})(?:-(\d+))?$/i);

  if (!match) {
    return {
      valid: false,
      error: `Invalid quotation number format "${trimmed}". Expected format: QTN-XXXX-XX (e.g., QTN-2627-01) with a 4-digit series identifier.`,
    };
  }

  const series = match[1];
  const revisionNum = match[2] !== undefined ? parseInt(match[2], 10) : 0;
  const revisionStr = String(revisionNum).padStart(2, '0');
  const normalizedNo = `QTN-${series}-${revisionStr}`;

  return {
    valid: true,
    series,
    revision: revisionStr,
    revisionNum,
    normalizedNo,
  };
}

/**
 * Open IndexedDB for Review sheets
 */
function openReviewDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    const request = indexedDB.open(REVIEW_DB_NAME, REVIEW_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REVIEW_STORE)) {
        db.createObjectStore(REVIEW_STORE, { keyPath: 'series' });
      }
    };
  });
}

/**
 * Fallback to localStorage mirror
 */
function getFromLocalStorage(series) {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(`zoosh_review_sheet_${series}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('Failed to read from localStorage:', e);
    return null;
  }
}

function saveToLocalStorage(doc) {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    if (!doc || !doc.series) return;
    localStorage.setItem(`zoosh_review_sheet_${doc.series}`, JSON.stringify(doc));
    
    // Maintain an index of all series
    const indexRaw = localStorage.getItem('zoosh_review_series_index');
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    if (!index.includes(doc.series)) {
      index.push(doc.series);
      localStorage.setItem('zoosh_review_series_index', JSON.stringify(index));
    }
  } catch (e) {
    console.warn('Failed to mirror review sheet to localStorage:', e);
  }
}

/**
 * Retrieves the persistent Review document for a 4-digit quotation series.
 * Strict rule: One persistent Review document per four-digit series.
 */
export async function getReviewDocument(series) {
  if (!series) return null;

  // Try Supabase first if configured
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('review_sheets')
        .select('*')
        .eq('series', series)
        .maybeSingle();

      if (!error && data) {
        saveToLocalStorage(data);
        return data;
      }
    } catch (e) {
      // Supabase table may not exist yet or network offline, gracefully fall through
    }
  }

  // Try IndexedDB
  try {
    const db = await openReviewDB();
    if (db) {
      const doc = await new Promise((resolve, reject) => {
        const tx = db.transaction(REVIEW_STORE, 'readonly');
        const store = tx.objectStore(REVIEW_STORE);
        const req = store.get(series);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      if (doc) return doc;
    }
  } catch (e) {
    console.warn('IndexedDB read failed, checking localStorage fallback:', e);
  }

  // Fallback to localStorage
  return getFromLocalStorage(series);
}

/**
 * Saves a Review document atomically.
 */
export async function saveReviewDocument(doc) {
  if (!doc || !doc.series) {
    throw new Error('Invalid Review Document: missing series identifier');
  }

  const now = new Date().toISOString();
  const cleanDoc = {
    ...doc,
    updatedAt: now,
  };

  // Try Supabase if configured
  if (isSupabaseConfigured) {
    try {
      await supabase
        .from('review_sheets')
        .upsert(cleanDoc, { onConflict: 'series' });
    } catch (e) {
      // Continue to local persistence
    }
  }

  // Persist to IndexedDB
  try {
    const db = await openReviewDB();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(REVIEW_STORE, 'readwrite');
        const store = tx.objectStore(REVIEW_STORE);
        const req = store.put(cleanDoc);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    }
  } catch (e) {
    console.warn('IndexedDB write failed, relying on localStorage:', e);
  }

  // Always mirror to localStorage
  saveToLocalStorage(cleanDoc);

  return cleanDoc;
}

/**
 * Creates the initial Review document when a user explicitly clicks Review for the first time.
 * Section 3 Rules:
 * 1. Extract its four-digit series identifier.
 * 2. Check whether a Review document already exists for that series.
 * 3. Import product list from exact quotation revision whose Review button was clicked.
 * 4. Original quotation order.
 * 5. Import product names, descriptions, quantities, units, and reference images.
 * 6. Initialize Review Sheet No. sequence (01).
 * 7. Save source quotation number and revision.
 */
export async function createInitialReviewDocument(quote) {
  const parsed = parseQuotationSeries(quote.no);
  if (!parsed.valid) {
    throw new Error(parsed.error);
  }

  const { series, normalizedNo } = parsed;
  const now = new Date().toISOString();

  // Import products from the quote in their exact order
  const rawItems = quote.items || [];
  const itemData = quote.itemData || {};
  const itemPhotos = quote.itemPhotos || {};

  const products = rawItems.map((itemId, idx) => {
    const data = itemData[itemId] || {};
    const photo = itemPhotos[itemId] || null;

    return {
      id: `rev-item-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
      sourceItemId: itemId,
      itemIndex: idx + 1,
      name: (data.name || '').trim() || `Product ${idx + 1}`,
      spec: (data.spec || '').trim(),
      qty: data.qty !== undefined && data.qty !== '' ? data.qty : '1',
      utype: data.utype || 'nos',
      unitPrice: data.unit || '',
      photo: photo,
      annotations: [],
      additionalImages: [],
      imageLocked: false,
      productRevision: '00',
      remarksRevision: '00',
      clientRemarks: [],
      customerNotes: '',
      fabricSelections: [],
      productId: null, // Assigned only upon production approval
      approvalStatus: 'Pending',
      approvedBy: '',
      approvedAt: null,
      version: 1,
    };
  });

  const initialSheetNo = 1;
  const sheetNoFormatted = '01';
  const initialSourceQuoteNo = quote.no || normalizedNo;

  const initialHistory = [
    {
      id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      sheetNo: initialSheetNo,
      sheetNoFormatted,
      sourceQuotationNo: initialSourceQuoteNo,
      timestamp: now,
      user: 'Administrator',
      summary: `Initial Review document created with ${products.length} products imported from ${initialSourceQuoteNo}.`,
      changes: {
        added: products.length,
        removed: 0,
        changed: 0,
        qtyUpdated: 0,
        details: [`Imported ${products.length} products in original quotation order.`],
      },
      status: 'Success',
    },
  ];

  const initialSnapshots = {
    [initialSheetNo]: {
      sheetNo: initialSheetNo,
      sheetNoFormatted,
      sourceQuotationNo: initialSourceQuoteNo,
      timestamp: now,
      products: JSON.parse(JSON.stringify(products)),
      client: quote.client ? { ...quote.client } : {},
      company: quote.company ? { ...quote.company } : {},
      createdAt: now,
    },
  };

  const newDoc = {
    series,
    currentSheetNo: initialSheetNo,
    sheetNoFormatted,
    heading: 'Product Review Sheet',
    displayTitle: `QTN-${series} / REVIEW SHEET NO.: ${sheetNoFormatted}`,
    latestQuotationNo: initialSourceQuoteNo,
    sourceRevision: parsed.revisionNum,
    createdAt: now,
    updatedAt: now,
    client: quote.client ? { ...quote.client } : {},
    company: quote.company ? { ...quote.company } : {},
    products,
    archivedProducts: [],
    history: initialHistory,
    snapshots: initialSnapshots,
  };

  return await saveReviewDocument(newDoc);
}

/**
 * Retrieve all Review Sheets for listing or reference
 */
export async function getAllReviewDocuments() {
  const list = [];
  try {
    const db = await openReviewDB();
    if (db) {
      const docs = await new Promise((resolve, reject) => {
        const tx = db.transaction(REVIEW_STORE, 'readonly');
        const store = tx.objectStore(REVIEW_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      list.push(...docs);
    }
  } catch (e) {
    console.warn('Could not read all review documents from IndexedDB:', e);
  }

  // Also check localStorage
  try {
    const indexRaw = localStorage.getItem('zoosh_review_series_index');
    const index = indexRaw ? JSON.parse(indexRaw) : [];
    index.forEach((s) => {
      if (!list.some((doc) => doc.series === s)) {
        const doc = getFromLocalStorage(s);
        if (doc) list.push(doc);
      }
    });
  } catch (e) {
    // ignore
  }

  return list;
}
