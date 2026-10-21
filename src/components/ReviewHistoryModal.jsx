import React from 'react';

export default function ReviewHistoryModal({
  isOpen,
  onClose,
  history = [],
  snapshots = {},
  activeSheetNo,
  viewingSnapshotNo,
  onSelectSnapshot,
  onReturnToActive,
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
          maxWidth: '750px',
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
              Review Sheet Update History & Snapshots
            </h3>
            <p style={{ fontSize: '11px', color: 'var(--gray)', margin: '2px 0 0' }}>
              Immutable audit history and snapshots per Review Sheet No. (UI audit log only, excluded from print)
            </p>
          </div>
          <button
            onClick={onClose}
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

        {/* Content list */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {history.length === 0 ? (
            <p style={{ color: 'var(--gray)', fontStyle: 'italic', textAlign: 'center', margin: '30px 0' }}>
              No synchronization history recorded yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {history.map((entry) => {
                const isCurrentActive = entry.sheetNo === activeSheetNo;
                const isBeingViewed = viewingSnapshotNo === entry.sheetNo;
                const formattedDate = entry.timestamp
                  ? new Date(entry.timestamp).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : '—';

                return (
                  <div
                    key={entry.id || entry.sheetNo}
                    style={{
                      border: isBeingViewed ? '2px solid var(--black)' : '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '16px',
                      background: isBeingViewed ? 'rgba(0,0,0,0.02)' : '#fff',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontFamily: 'var(--font-serif)',
                            fontSize: '15px',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Review Sheet No. {entry.sheetNoFormatted || String(entry.sheetNo).padStart(2, '0')}
                        </span>
                        {isCurrentActive && (
                          <span
                            style={{
                              fontSize: '9px',
                              background: 'var(--black)',
                              color: '#fff',
                              padding: '2px 6px',
                              borderRadius: '2px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Active Document
                          </span>
                        )}
                        {isBeingViewed && (
                          <span
                            style={{
                              fontSize: '9px',
                              background: '#28a745',
                              color: '#fff',
                              padding: '2px 6px',
                              borderRadius: '2px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}
                          >
                            Currently Viewing
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--gray)' }}>
                          🕒 {formattedDate}
                        </span>
                        {snapshots && snapshots[entry.sheetNo] && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSnapshot(entry.sheetNo);
                              onClose();
                            }}
                            className="del-btn"
                            style={{
                              borderColor: 'var(--border)',
                              fontSize: '11px',
                              padding: '4px 10px',
                              background: isBeingViewed ? 'var(--black)' : '#fff',
                              color: isBeingViewed ? '#fff' : 'var(--black)',
                            }}
                          >
                            {isBeingViewed ? 'Viewing' : 'Inspect Snapshot'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--dark-gray)', marginBottom: '8px' }}>
                      <strong>Source Quotation:</strong> {entry.sourceQuotationNo || '—'} &nbsp;|&nbsp;{' '}
                      <strong>User:</strong> {entry.user || 'Administrator'}
                    </div>

                    <div
                      style={{
                        fontSize: '12px',
                        background: 'var(--near-white)',
                        padding: '10px 12px',
                        borderRadius: '3px',
                        borderLeft: '3px solid var(--black)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>{entry.summary}</div>
                      {entry.changes && entry.changes.details && entry.changes.details.length > 0 && (
                        <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '11px', color: 'var(--gray)' }}>
                          {entry.changes.details.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--near-white)',
          }}
        >
          <div>
            {viewingSnapshotNo && viewingSnapshotNo !== activeSheetNo && (
              <button
                type="button"
                onClick={() => {
                  onReturnToActive();
                  onClose();
                }}
                className="nav-btn gold"
                style={{ fontSize: '11px', padding: '6px 14px' }}
              >
                ← Return to Active Document
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="nav-btn outline"
            style={{ color: 'var(--black)', borderColor: 'var(--black)', fontSize: '11px', padding: '6px 14px' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
