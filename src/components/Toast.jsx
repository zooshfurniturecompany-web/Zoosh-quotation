import React, { useEffect } from 'react';

export default function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`toast ${type}`}
      style={{
        background: 'var(--black)',
        color: 'var(--white)',
        padding: '12px 24px',
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        fontWeight: '600',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        border: '1px solid var(--white)',
        boxShadow: 'var(--shadow-md)',
        marginBottom: '10px',
        animation: 'slideDownIn 0.3s ease-out forwards',
      }}
    >
      {message}
    </div>
  );
}
