import { supabase, isSupabaseConfigured } from './supabaseClient';

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
      .select('*');
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
  const healed = await Promise.all(
    quotes.map(async (q) => {
      if (q.sequenceNumber === undefined || q.revision === undefined) {
        const match = (q.no || '').match(/^(?:QTN-)?(\d+)(?:-(\d+))?$/i);
        const seq = match ? parseInt(match[1], 10) : 2445;
        const rev = match && match[2] ? parseInt(match[2], 10) : 0;
        const updated = {
          ...q,
          sequenceNumber: seq,
          revision: rev
        };
        await saveQuotationDirect(updated);
        return updated;
      }
      return q;
    })
  );

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

export async function saveQuotation(quote) {
  const allQuotes = await getAllQuotations();
  const now = new Date().toISOString();
  let cleanQuote = { ...quote };

  if (!quote.id) {
    const seq = getNextSequentialNumber(allQuotes);
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
    let currentRev = parseInt(quote.revision, 10) || 0;

    if (match) {
      seq = parseInt(match[1], 10);
      if (match[2] !== undefined) {
        currentRev = parseInt(match[2], 10);
      }
    }
    const nextRev = currentRev + 1;

    const isDuplicate = allQuotes.some((q) => {
      if (q.id === quote.id) return false;
      return parseInt(q.sequenceNumber, 10) === seq;
    });

    if (isDuplicate) {
      return Promise.reject(
        new Error(`Quotation number QTN-${seq} already exists. Please choose a unique number.`)
      );
    }

    const newNo = `QTN-${seq}-${String(nextRev).padStart(2, '0')}`;
    const newHistoryEntry = {
      revision: String(nextRev).padStart(2, '0'),
      timestamp: now,
      type: 'updated'
    };

    cleanQuote = {
      ...quote,
      no: newNo,
      sequenceNumber: seq,
      revision: nextRev,
      updatedAt: now,
      history: [...(quote.history || []), newHistoryEntry]
    };
  }

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

export async function duplicateQuotation(id) {
  const quote = await getQuotationById(id);
  if (!quote) throw new Error('Quotation not found');

  const allQuotes = await getAllQuotations();
  const seq = getNextSequentialNumber(allQuotes);
  const now = new Date().toISOString();
  const newNo = `QTN-${seq}-00`;

  const duplicated = {
    ...quote,
    id: Date.now().toString(),
    no: newNo,
    sequenceNumber: seq,
    revision: 0,
    date: new Date().toISOString().split('T')[0],
    createdAt: now,
    updatedAt: now,
    status: 'Draft',
    history: [{ revision: '00', timestamp: now, type: 'created' }]
  };

  await saveQuotationDirect(duplicated);
  return duplicated;
}
