import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import QuotationForm from './components/QuotationForm';
import QuotationPreview from './components/QuotationPreview';
import Toast from './components/Toast';
import {
  getAllQuotations,
  getQuotationById,
  saveQuotation,
  deleteQuotation,
  duplicateQuotation,
  getNextSequentialNumber,
} from './utils/storage';
import { downloadPDF } from './utils/pdfGenerator';
import { DEFAULT_ZOOSH_LOGO } from './utils/logo';
import { supabase, isSupabaseConfigured } from './utils/supabaseClient';

export function sanitizeQuote(quote) {
  return quote;
}

export default function App() {
  const [quotations, setQuotations] = useState([]);
  const [currentView, setCurrentView] = useState('dashboard'); // 'dashboard' | 'form' | 'view'
  const [activeQuote, setActiveQuote] = useState(null);
  const [downloadModalQuote, setDownloadModalQuote] = useState(null);
  const [toasts, setToasts] = useState([]);

  // Load all quotes on mount and listen to realtime updates
  useEffect(() => {
    loadQuotations();

    // Visual connection mode indicator
    if (isSupabaseConfigured) {
      addToast('Collaborative Mode: Connected to Supabase Cloud Database', 'success');
    } else {
      addToast('Single-User Mode: Running locally in your browser (IndexedDB)', 'info');
    }

    let subscription = null;
    if (isSupabaseConfigured && supabase) {
      subscription = supabase
        .channel('quotations-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'quotations' },
          (payload) => {
            console.log('Realtime change detected:', payload);
            loadQuotations();
          }
        )
        .subscribe();
    }

    return () => {
      if (subscription && supabase) {
        supabase.removeChannel(subscription);
      }
    };
  }, []);

  const loadQuotations = async () => {
    try {
      const data = await getAllQuotations();
      setQuotations(data);
    } catch (err) {
      console.error('Failed to load quotations:', err);
      addToast('Error loading quotations', 'error');
    }
  };

  const addToast = (message, type = 'success') => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleNew = () => {
    const nextSeq = getNextSequentialNumber(quotations);
    const nextNo = `QTN-${nextSeq}-00`;

    // Find the most recently updated quotation to retain client and company details
    let prevQuote = null;
    if (quotations && quotations.length > 0) {
      const sortedByRecency = [...quotations].sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt || 0);
        const dateB = new Date(b.updatedAt || b.createdAt || 0);
        return dateB - dateA;
      });
      prevQuote = sortedByRecency[0];
    }

    const blankQuote = {
      id: '',
      no: nextNo,
      sequenceNumber: nextSeq,
      revision: 0,
      date: new Date().toISOString().split('T')[0],
      valid: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      curr: prevQuote?.curr || 'INR',
      client: prevQuote?.client 
        ? { ...prevQuote.client } 
        : { name: '', co: '', phone: '', addr: '' },
      company: {
        name: prevQuote?.company?.name || 'ZOOSH',
        tag: prevQuote?.company?.tag || 'Custom Furniture Company',
        addr: prevQuote?.company?.addr || 'Palakkad, Kerala, India',
        phone: prevQuote?.company?.phone || '+91 9567193992',
        email: prevQuote?.company?.email || 'zooshfurniturecompany@gmail.com',
        web: prevQuote?.company?.web || 'www.zoosh.in',
        ...(prevQuote?.company || {}),
      },
      logoData: prevQuote?.logoData || DEFAULT_ZOOSH_LOGO,
      items: [],
      itemData: {},
      itemPhotos: {},
      afState: {},
      taxPricing: prevQuote?.taxPricing 
        ? { 
            ...prevQuote.taxPricing, 
            gst: (prevQuote.taxPricing.gst !== undefined && prevQuote.taxPricing.gst !== '') ? prevQuote.taxPricing.gst : '18', 
            disc: prevQuote.taxPricing.disc || '0',
            removeGst: Boolean(prevQuote.taxPricing.removeGst)
          } 
        : { gst: '18', disc: '0', removeGst: false },
      terms: {
        signName: prevQuote?.terms?.signName || 'LISHA',
        signDesg: prevQuote?.terms?.signDesg || 'Administrator',
        text: prevQuote?.terms?.text || 'Adv 70% at the time of confirming order, balance 20% on progress. Final balance of 10% before final finish and handover.\nAny additional work not part of this quotation will be charged 100% in advance as per actuals.\nTaxes and Transportation extra as applicable.\nInvoice validity 30 days from the date.\nIf changing any specification rate may be change accordingly.\nAll rates are Based on 3D Designs drawings only, final quote will purely depend upon final approved designs and detailed drawings.\nOnly the items quoted above are included in our scope.\nAll other terms and conditions will be as per company agreement only.\nPower and water to be supplied by client.',
        ...(prevQuote?.terms || {}),
      },
      status: 'Draft',
    };
    setActiveQuote(blankQuote);
    setCurrentView('form');
  };

  const handleSave = async (quote) => {
    try {
      const isEdit = !!quote.id;
      const saved = await saveQuotation(quote);
      
      addToast(
        isEdit ? 'Quotation Updated Successfully' : 'Quotation Saved Successfully',
        'success'
      );
      
      // Update local memory state directly: place newly created / edited quotation at the VERY TOP
      setQuotations((prev) => [saved, ...prev.filter((q) => q.id !== saved.id)]);
      
      setCurrentView('dashboard');
      setActiveQuote(null);
    } catch (err) {
      console.error('Failed to save quotation:', err);
      addToast('Error saving quotation', 'error');
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const duplicated = await duplicateQuotation(id);
      addToast(`Quotation Duplicated as ${duplicated.no}`, 'success');
      await loadQuotations();
    } catch (err) {
      console.error('Failed to duplicate quotation:', err);
      addToast('Error duplicating quotation', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to permanently delete this quotation?')) {
      try {
        await deleteQuotation(id);
        addToast('Quotation Deleted Successfully', 'success');
        await loadQuotations();
      } catch (err) {
        console.error('Failed to delete quotation:', err);
        addToast('Error deleting quotation', 'error');
      }
    }
  };

  const handleDownloadPDF = async (quote, withLogo = true) => {
    try {
      let fullQuote = quote;
      if (quote?.id && (!quote.itemPhotos || !quote.logoData)) {
        fullQuote = await getQuotationById(quote.id);
      }
      downloadPDF(fullQuote, { withLogo });
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      addToast('Error generating PDF', 'error');
    }
  };

  const processImportedJSON = async (contents) => {
    try {
      const parsed = JSON.parse(contents);
      const normalized = normalizeImportedQuotation(parsed);
      if (normalized && normalized.no) {
        const existing = quotations.find((q) => q.no === normalized.no);
        if (existing) {
          normalized.id = existing.id;
          normalized.createdAt = existing.createdAt;
        } else {
          normalized.id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
        }
        await saveQuotation(normalized);
        addToast('Quotation Imported Successfully', 'success');
        await loadQuotations();
      } else {
        addToast('Invalid quotation JSON structure', 'error');
      }
    } catch (err) {
      console.error(err);
      addToast(`Import failed: ${err.message || 'Invalid format'}`, 'error');
    }
  };

  const fallbackImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        await processImportedJSON(evt.target.result);
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleImportJSON = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{
            description: 'JSON Quotation Files',
            accept: { 'application/json': ['.json'] }
          }],
          multiple: false,
          startIn: 'downloads'
        });
        const file = await handle.getFile();
        const contents = await file.text();
        await processImportedJSON(contents);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(err);
          fallbackImportJSON();
        }
      }
    } else {
      fallbackImportJSON();
    }
  };

  return (
    <div>
      {/* Top Navbar */}
      <div className="navbar">
        <div className="nav-brand" style={{ cursor: 'pointer' }} onClick={() => setCurrentView('dashboard')}>
          ZOOSH <span>QUOTATION</span>
        </div>
        <div className="nav-actions">
          {currentView === 'dashboard' && (
            <button className="nav-btn gold" onClick={handleNew}>
              + New Quotation
            </button>
          )}
          {currentView === 'form' && (
            <button className="nav-btn outline" onClick={() => setCurrentView('dashboard')}>
              Dashboard
            </button>
          )}
          {currentView === 'view' && (
            <button className="nav-btn outline" onClick={() => setCurrentView('dashboard')}>
              ← Dashboard
            </button>
          )}
        </div>
      </div>

      {/* Hero Header */}
      <div className="hero">
        <h1>ZOOSH <span>Quotation Portal</span></h1>
        <p>Professional Furniture Estimator & Management Tool</p>
      </div>

      {/* Main Views */}
      {currentView === 'dashboard' && (
        <Dashboard
          quotations={quotations}
          onNew={handleNew}
          onView={async (quote) => {
            try {
              const fullQuote = await getQuotationById(quote.id);
              setActiveQuote(fullQuote);
              setCurrentView('view');
            } catch (err) {
              console.error('Failed to load full quotation details:', err);
              addToast('Error loading quotation details', 'error');
            }
          }}
          onEdit={async (quote) => {
            try {
              const fullQuote = await getQuotationById(quote.id);
              setActiveQuote(fullQuote);
              setCurrentView('form');
            } catch (err) {
              console.error('Failed to load full quotation details:', err);
              addToast('Error loading quotation details', 'error');
            }
          }}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onDownloadPDF={(quote) => setDownloadModalQuote(quote)}
          onImportJSON={handleImportJSON}
        />
      )}

      {currentView === 'form' && (
        <QuotationForm
          initialQuote={activeQuote}
          onSave={handleSave}
          onCancel={() => {
            setCurrentView('dashboard');
            setActiveQuote(null);
          }}
        />
      )}

      {currentView === 'view' && activeQuote && (
        <div className="main">
          <QuotationPreview
            quote={activeQuote}
            onBack={() => setCurrentView('dashboard')}
            onDownloadPDF={handleDownloadPDF}
          />
        </div>
      )}

      {/* Dual PDF Download Modal */}
      {downloadModalQuote && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 4000,
            backdropFilter: 'blur(3px)',
            padding: '16px'
          }}
          onClick={() => setDownloadModalQuote(null)}
        >
          <div
            style={{
              background: '#fff',
              maxWidth: '520px',
              width: '100%',
              padding: '28px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '2px solid var(--black)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-serif)', fontSize: '20px', fontWeight: 700, color: 'var(--black)' }}>
                  Download Quotation PDF
                </div>
                <div style={{ fontSize: '13px', color: 'var(--gray)', marginTop: '3px' }}>
                  {downloadModalQuote.no} &bull; {downloadModalQuote.client?.name || 'Client'}
                </div>
              </div>
              <button
                onClick={() => setDownloadModalQuote(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  cursor: 'pointer',
                  lineHeight: 1,
                  color: 'var(--gray)'
                }}
              >
                &times;
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--near-black)', marginBottom: '20px', lineHeight: 1.5 }}>
              Choose your PDF export option:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Option 1: With Logo */}
              <div
                style={{
                  padding: '16px 18px',
                  border: '1.5px solid var(--black)',
                  background: 'var(--near-white)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => {
                  const q = downloadModalQuote;
                  setDownloadModalQuote(null);
                  handleDownloadPDF(q, true);
                }}
              >
                <div style={{ fontSize: '28px', flexShrink: 0 }}>🌟</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--black)' }}>
                    With Logo
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', lineHeight: 1.4 }}>
                    Includes company logo, contact bar, and signatory footer.
                  </div>
                </div>
                <div style={{
                  padding: '6px 12px',
                  background: 'var(--black)',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Download (With Logo)
                </div>
              </div>

              {/* Option 2: Without Logo */}
              <div
                style={{
                  padding: '16px 18px',
                  border: '1.5px solid #ccc',
                  background: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => {
                  const q = downloadModalQuote;
                  setDownloadModalQuote(null);
                  handleDownloadPDF(q, false);
                }}
              >
                <div style={{ fontSize: '28px', flexShrink: 0 }}>🏢</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--black)' }}>
                    Without Logo
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', lineHeight: 1.4 }}>
                    Address only with clean, neutral layout and no company logo.
                  </div>
                </div>
                <div style={{
                  padding: '6px 12px',
                  background: '#f0f0f0',
                  color: 'var(--black)',
                  border: '1px solid #ccc',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Download (Without Logo)
                </div>
              </div>
            </div>

            <div style={{ marginTop: '22px', textAlign: 'right' }}>
              <button
                type="button"
                className="nav-btn outline"
                style={{ padding: '8px 20px', fontSize: '12px' }}
                onClick={() => setDownloadModalQuote(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      <div
        id="toast-container"
        style={{
          position: 'fixed',
          top: '80px',
          right: '20px',
          zIndex: 3000,
        }}
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  );
}

function normalizeImportedQuotation(parsed) {
  if (!parsed) return null;
  const normalized = { ...parsed };
  if (parsed.quote) {
    normalized.no = parsed.no || parsed.quote.no;
    normalized.date = parsed.date || parsed.quote.date;
    normalized.valid = parsed.valid || parsed.quote.valid;
    normalized.curr = parsed.curr || parsed.quote.curr;
    delete normalized.quote;
  }
  
  // Normalize quotation number to QTN-XXXX-XX format if not already
  if (normalized.no) {
    const match = normalized.no.match(/^(?:QTN-)?(\d+)(?:-(\d+))?$/i);
    if (match) {
      const seq = parseInt(match[1], 10);
      const rev = match[2] ? parseInt(match[2], 10) : 0;
      normalized.sequenceNumber = seq;
      normalized.revision = rev;
      normalized.no = `QTN-${seq}-${String(rev).padStart(2, '0')}`;
    }
  } else {
    normalized.sequenceNumber = 2445;
    normalized.revision = 0;
    normalized.no = 'QTN-2445-00';
  }

  normalized.id = normalized.id || Date.now().toString() + Math.random().toString(36).substr(2, 5);
  normalized.logoData = normalized.logoData || DEFAULT_ZOOSH_LOGO;
  normalized.company = {
    name: 'ZOOSH',
    tag: 'Custom Furniture Company',
    addr: 'Palakkad, Kerala, India',
    phone: '+91 9567193992',
    email: 'zooshfurniturecompany@gmail.com',
    web: 'www.zoosh.in',
    ...(normalized.company || {})
  };
  normalized.items = normalized.items || [];
  normalized.itemData = normalized.itemData || {};
  normalized.itemPhotos = normalized.itemPhotos || {};
  normalized.afState = normalized.afState || {};
  normalized.status = normalized.status || 'Draft';
  
  // Set initial creation history if not present
  if (!normalized.history || normalized.history.length === 0) {
    const now = new Date().toISOString();
    const revCode = String(normalized.revision || 0).padStart(2, '0');
    normalized.history = [{ revision: revCode, timestamp: now, type: 'created' }];
  }
  return normalized;
}
