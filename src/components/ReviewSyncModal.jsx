import React from 'react';

export default function ReviewSyncModal({
  isOpen,
  onClose,
  diffSummary,
  hasChanges,
  targetQuoteNo,
  currentSheetNo,
  nextSheetNo,
  onConfirmSync,
  isSyncing,
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          background: '#fff',
          borderRadius: '4px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'var(--shadow-md)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--near-white)',
          }}
        >
          <div>
            <h3
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '18px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                margin: 0,
              }}
            >
              Controlled Revision Synchronization
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--gray)', margin: '2px 0 0' }}>
              Synchronizing with {targetQuoteNo}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSyncing}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'var(--dark-gray)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {!hasChanges ? (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                background: 'var(--near-white)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
              }}
            >
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>✓</div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 700 }}>
                Already Synchronized
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--gray)', margin: 0 }}>
                Quotation revision <strong>{targetQuoteNo}</strong> introduces no changes to this Review document.
                Review Sheet No. remains <strong>{String(currentSheetNo).padStart(2, '0')}</strong> without creating duplicate numbers.
              </p>
            </div>
          ) : (
            <div>
              {/* Advance Banner */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'rgba(0,0,0,0.03)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
                    Sequence Update
                  </span>
                  <div style={{ fontSize: '14px', fontWeight: 700 }}>
                    Review Sheet No. {String(currentSheetNo).padStart(2, '0')} → Review Sheet No. {String(nextSheetNo).padStart(2, '0')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600 }}>
                    Target Revision
                  </span>
                  <div style={{ fontSize: '13px', fontWeight: 700 }}>{targetQuoteNo}</div>
                </div>
              </div>

              {/* Differences breakdown */}
              <h5 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                Detected Changes & Preservation Rules
              </h5>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--gray)', textTransform: 'uppercase' }}>Unchanged Products (Case A)</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px' }}>
                    {diffSummary?.unchanged?.length || 0}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gray)', marginTop: '2px' }}>
                    Retains annotations, fabric specs, notes & approvals.
                  </div>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--gray)', textTransform: 'uppercase' }}>Quantity Updates (Case B)</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px', color: '#0066cc' }}>
                    {diffSummary?.qtyUpdated?.length || 0}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gray)', marginTop: '2px' }}>
                    Updated in place without discarding notes or annotations.
                  </div>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--gray)', textTransform: 'uppercase' }}>Image Changes (Case C)</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px', color: '#e67e22' }}>
                    {diffSummary?.changedImages?.length || 0}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gray)', marginTop: '2px' }}>
                    Old version & annotations archived to history.
                  </div>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--gray)', textTransform: 'uppercase' }}>Spec Changes (Case D)</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px', color: '#8e44ad' }}>
                    {diffSummary?.changedSpecs?.length || 0}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gray)', marginTop: '2px' }}>
                    New active version created; previous archived.
                  </div>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--gray)', textTransform: 'uppercase' }}>New Products Added (Case F)</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px', color: '#27ae60' }}>
                    {diffSummary?.added?.length || 0}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gray)', marginTop: '2px' }}>
                    Imported in correct quotation order.
                  </div>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '10px 12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--gray)', textTransform: 'uppercase' }}>Removed Products (Case E)</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '2px', color: '#c0392b' }}>
                    {diffSummary?.removed?.length || 0}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--gray)', marginTop: '2px' }}>
                    Archived instead of permanently deleted.
                  </div>
                </div>
              </div>

              {/* Detailed logs */}
              {diffSummary?.details && diffSummary.details.length > 0 && (
                <div style={{ background: 'var(--near-white)', padding: '12px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '6px' }}>
                    Itemized Synchronization Log:
                  </div>
                  <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: '12px', color: 'var(--dark-gray)' }}>
                    {diffSummary.details.map((d, i) => (
                      <li key={i} style={{ marginBottom: '3px' }}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            alignItems: 'center',
            background: 'var(--near-white)',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSyncing}
            className="nav-btn outline"
            style={{ color: 'var(--black)', borderColor: 'var(--black)', fontSize: '11px', padding: '8px 16px' }}
          >
            Cancel
          </button>

          {hasChanges && (
            <button
              type="button"
              onClick={onConfirmSync}
              disabled={isSyncing}
              className="nav-btn gold"
              style={{ fontSize: '11px', padding: '8px 18px' }}
            >
              {isSyncing ? 'Committing Synchronization...' : `Confirm & Advance to Sheet No. ${String(nextSheetNo).padStart(2, '0')}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
