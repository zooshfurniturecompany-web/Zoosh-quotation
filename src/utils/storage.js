import { supabase, isSupabaseConfigured } from './supabaseClient';
import { DEFAULT_ZOOSH_LOGO } from './logo';

const DB_NAME = 'zoosh_quotation_db';
const DB_VERSION = 1;
const STORE_NAME = 'quotations';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function getAllQuotations() {
  let quotes = [];
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('quotations')
      .select('id, no, "sequenceNumber", revision, date, valid, curr, client, company, items, "itemData", "taxPricing", terms, status, history, "createdAt", "updatedAt"');
    if (error) throw error;
    quotes = data || [];
  } else {
    const db = await openDB();
    quotes = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // Self-healing migration for legacy records
  const healed = [];
  for (const q of quotes) {
    if (q.sequenceNumber === undefined || q.sequenceNumber === null || q.revision === undefined || q.revision === null) {
      try {
        const fullQ = await getQuotationById(q.id);
        if (fullQ) {
          const match = (fullQ.no || '').match(/^(?:QTN-)?(\d+)(?:-(\d+))?$/i);
          const seq = match ? parseInt(match[1], 10) : 2445;
          const rev = match && match[2] ? parseInt(match[2], 10) : 0;
          
          fullQ.sequenceNumber = seq;
          fullQ.revision = rev;
          
          await saveQuotationDirect(fullQ);
          healed.push(fullQ);
        } else {
          healed.push(q);
        }
      } catch (err) {
        console.error(`Failed to self-heal legacy record ${q.id}:`, err);
        // Keep the original record in the list even if self-healing fails
        healed.push(q);
      }
    } else {
      healed.push(q);
    }
  }

  return healed;
}

export async function getQuotationById(id) {
  let quote = null;
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('quotations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    quote = data || null;
  } else {
    const db = await openDB();
    quote = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  if (quote && (quote.sequenceNumber === undefined || quote.revision === undefined)) {
    const match = (quote.no || '').match(/^(?:QTN-)?(\d+)(?:-(\d+))?$/i);
    const seq = match ? parseInt(match[1], 10) : 2445;
    const rev = match && match[2] ? parseInt(match[2], 10) : 0;
    quote.sequenceNumber = seq;
    quote.revision = rev;
    await saveQuotationDirect(quote);
  }

  return quote;
}

export function getNextSequentialNumber(allQuotes) {
  let maxSeq = 2444; // Default starting sequence

  if (allQuotes && allQuotes.length > 0) {
    allQuotes.forEach((q) => {
      let seq = parseInt(q.sequenceNumber, 10);
      if (isNaN(seq)) {
        const match = (q.no || '').match(/^(?:QTN-)?(\d+)/i);
        if (match) {
          seq = parseInt(match[1], 10);
        }
      }
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    });
  }

  return maxSeq + 1;
}

export async function saveQuotationDirect(cleanQuote) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('quotations')
      .upsert(cleanQuote)
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(cleanQuote);
      request.onsuccess = () => resolve(cleanQuote);
      request.onerror = () => reject(request.error);
    });
  }
}

async function getMaxSequenceNumber() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('quotations')
      .select('sequenceNumber')
      .order('sequenceNumber', { ascending: false })
      .limit(1);
    if (error) throw error;
    return data && data.length > 0 ? parseInt(data[0].sequenceNumber, 10) : 2444;
  } else {
    const all = await getAllQuotations();
    let maxSeq = 2444;
    all.forEach((q) => {
      const seq = parseInt(q.sequenceNumber, 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    });
    return maxSeq;
  }
}

async function checkDuplicateSequenceNumber(seq, excludeId) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('quotations')
      .select('id')
      .eq('sequenceNumber', seq)
      .neq('id', excludeId || '')
      .limit(1);
    if (error) throw error;
    return data && data.length > 0;
  } else {
    const all = await getAllQuotations();
    return all.some((q) => {
      if (q.id === excludeId) return false;
      return parseInt(q.sequenceNumber, 10) === seq;
    });
  }
}

export async function saveQuotation(quote) {
  const now = new Date().toISOString();
  let cleanQuote = { ...quote };

  if (quote.itemPhotos) {
    try {
      cleanQuote.itemPhotos = await compressQuotationPhotos(quote.itemPhotos);
    } catch (e) {
      console.error('Failed to compress quotation photos:', e);
    }
  }

  if (!quote.id) {
    let seq = parseInt(quote.sequenceNumber, 10);
    if (isNaN(seq)) {
      const maxSeq = await getMaxSequenceNumber();
      seq = maxSeq + 1;
    }
    const quoteNo = `QTN-${seq}-00`;

    cleanQuote = {
      ...quote,
      id: Date.now().toString(),
      no: quoteNo,
      sequenceNumber: seq,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      status: quote.status || 'Draft',
      history: [{ revision: '00', timestamp: now, type: 'created' }]
    };
  } else {
    const match = (quote.no || '').match(/^(?:QTN-)?(\d+)(?:-(\d+))?$/i);
    let seq = parseInt(quote.sequenceNumber, 10) || 2445;
    let rev = parseInt(quote.revision, 10) || 0;

    if (match) {
      seq = parseInt(match[1], 10);
      if (match[2] !== undefined) {
        rev = parseInt(match[2], 10);
      }
    }

    const isDuplicate = await checkDuplicateSequenceNumber(seq, quote.id);
    // Only block if the sequence number has actually changed
    const originalSeq = parseInt(quote.sequenceNumber, 10);
    if (seq !== originalSeq && isDuplicate) {
      return Promise.reject(
        new Error(`Quotation number QTN-${seq} already exists. Please choose a unique number.`)
      );
    }

    const currentNo = quote.no || `QTN-${seq}-${String(rev).padStart(2, '0')}`;
    const newHistoryEntry = {
      revision: String(rev).padStart(2, '0'),
      timestamp: now,
      type: 'updated'
    };

    cleanQuote = {
      ...quote,
      no: currentNo,
      sequenceNumber: seq,
      revision: rev,
      updatedAt: now,
      history: [...(quote.history || []), newHistoryEntry]
    };
  }

  cleanQuote.logoData = cleanQuote.logoData || DEFAULT_ZOOSH_LOGO;
  return saveQuotationDirect(cleanQuote);
}

export async function deleteQuotation(id) {
  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from('quotations')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  } else {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
}

async function getMaxRevisionForSequence(seq) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('quotations')
      .select('revision, no')
      .eq('sequenceNumber', seq);
    if (error) throw error;
    let maxRev = -1;
    (data || []).forEach((q) => {
      let rev = parseInt(q.revision, 10);
      if (isNaN(rev)) {
        const match = (q.no || '').match(/^(?:QTN-)?\d+(?:-(\d+))?$/i);
        if (match && match[1] !== undefined) {
          rev = parseInt(match[1], 10);
        }
      }
      if (!isNaN(rev) && rev > maxRev) {
        maxRev = rev;
      }
    });
    return maxRev >= 0 ? maxRev : 0;
  } else {
    const all = await getAllQuotations();
    let maxRev = -1;
    all.forEach((q) => {
      if (parseInt(q.sequenceNumber, 10) === seq) {
        let rev = parseInt(q.revision, 10);
        if (isNaN(rev)) {
          const match = (q.no || '').match(/^(?:QTN-)?\d+(?:-(\d+))?$/i);
          if (match && match[1] !== undefined) {
            rev = parseInt(match[1], 10);
          }
        }
        if (!isNaN(rev) && rev > maxRev) {
          maxRev = rev;
        }
      }
    });
    return maxRev >= 0 ? maxRev : 0;
  }
}

export async function duplicateQuotation(id) {
  const quote = await getQuotationById(id);
  if (!quote) throw new Error('Quotation not found');

  let seq = parseInt(quote.sequenceNumber, 10);
  if (isNaN(seq)) {
    const match = (quote.no || '').match(/^(?:QTN-)?(\d+)/i);
    seq = match ? parseInt(match[1], 10) : 2445;
  }

  const maxRev = await getMaxRevisionForSequence(seq);
  const nextRev = maxRev + 1;
  const now = new Date().toISOString();
  const newNo = `QTN-${seq}-${String(nextRev).padStart(2, '0')}`;

  const duplicated = {
    ...quote,
    logoData: quote.logoData || DEFAULT_ZOOSH_LOGO,
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    no: newNo,
    sequenceNumber: seq,
    revision: nextRev,
    date: new Date().toISOString().split('T')[0],
    createdAt: now,
    updatedAt: now,
    status: 'Draft',
    history: [
      ...(quote.history || []),
      { revision: String(nextRev).padStart(2, '0'), timestamp: now, type: 'duplicated' }
    ]
  };

  await saveQuotationDirect(duplicated);
  return duplicated;
}

export function compressImage(base64Str, maxWidth = 400, maxHeight = 300, quality = 0.75) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return resolve(base64Str);
    }
    if (!base64Str || !base64Str.startsWith('data:image')) {
      return resolve(base64Str);
    }

    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
}

export async function compressQuotationPhotos(itemPhotos) {
  if (!itemPhotos) return {};
  const compressedPhotos = {};
  const entries = Object.entries(itemPhotos);
  
  const promises = entries.map(async ([itemId, photoStr]) => {
    if (photoStr && photoStr.startsWith('data:image')) {
      if (photoStr.length > 55000) {
        try {
          compressedPhotos[itemId] = await compressImage(photoStr, 400, 300, 0.75);
        } catch (e) {
          console.warn('Failed to compress image for item:', itemId, e);
          compressedPhotos[itemId] = photoStr;
        }
      } else {
        compressedPhotos[itemId] = photoStr;
      }
    } else {
      compressedPhotos[itemId] = photoStr;
    }
  });

  await Promise.all(promises);
  return compressedPhotos;
}
