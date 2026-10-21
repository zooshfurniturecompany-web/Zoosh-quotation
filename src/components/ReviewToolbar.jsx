import React from 'react';

export const TOOLS = {
  SELECT: 'select',
  DIMENSION: 'dimension',
  BOX: 'box',
  LEADER: 'leader',
  TERMINATOR: 'terminator',
  CALLOUT: 'callout',
  HIGHLIGHT: 'highlight',
  CIRCLE: 'circle',
  TEXT: 'text',
  MAGNIFIER: 'magnifier',
  STAMP: 'stamp',
};

const TOOL_DEFS = [
  { id: TOOLS.SELECT, label: 'Select / Move', icon: '✋', shortcut: 'V' },
  { id: TOOLS.DIMENSION, label: 'Dimension Line', icon: '📏', shortcut: 'D', desc: 'Line with arrowheads and editable cm label' },
  { id: TOOLS.BOX, label: 'Box / Frame', icon: '⬜', shortcut: 'B', desc: 'Rectangle bounding box to highlight a part' },
  { id: TOOLS.LEADER, label: 'Leader Line', icon: '↗', shortcut: 'L', desc: 'Adjustable line with arrowhead or dot' },
  { id: TOOLS.TERMINATOR, label: 'Anchor / Terminator', icon: '⚓', shortcut: 'A', desc: 'Anchor dot connected to horizontal text box' },
  { id: TOOLS.CALLOUT, label: 'Callout Box', icon: '💬', shortcut: 'C', desc: 'Dialogue-style annotation bubble with italic text' },
  { id: TOOLS.HIGHLIGHT, label: 'Highlight Pen', icon: '🖊', shortcut: 'H', desc: 'Freehand translucent highlighter' },
  { id: TOOLS.CIRCLE, label: 'Circle Mark', icon: '⭕', shortcut: 'O', desc: 'Red circle mark with adjustable size' },
  { id: TOOLS.TEXT, label: 'Text Box', icon: '🔤', shortcut: 'T', desc: 'General-purpose instruction text box' },
  { id: TOOLS.MAGNIFIER, label: 'Magnifier', icon: '🔍', shortcut: 'M', desc: 'Circular detail inset with zoom' },
  { id: TOOLS.STAMP, label: 'Approval Stamp', icon: '🛡', shortcut: 'S', desc: 'Official Green Production Approval Stamp' },
];

const COLORS = [
  { id: '#e74c3c', label: 'Red (Default)', hex: '#e74c3c' },
  { id: '#0066cc', label: 'Blue', hex: '#0066cc' },
  { id: '#f39c12', label: 'Yellow / Orange', hex: '#f39c12' },
  { id: '#27ae60', label: 'Green', hex: '#27ae60' },
  { id: '#111111', label: 'Black', hex: '#111111' },
  { id: '#ffffff', label: 'White', hex: '#ffffff' },
];

export default function ReviewToolbar({
  activeTool,
  onSelectTool,
  activeColor,
  onChangeColor,
  activeStroke,
  onChangeStroke,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDeleteSelected,
  hasSelection,
  orientation,
  onToggleOrientation,
  isLocked,
}) {
  return (
    <div
      className="no-print review-toolbar-ribbon"
      style={{
        background: '#ffffff',
        borderBottom: '2px solid var(--border)',
        padding: '8px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        position: 'sticky',
        top: '52px',
        zIndex: 250,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      {/* Group 1: Editing & Annotation Tools */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--muted)',
            marginRight: '4px',
          }}
        >
          Tools:
        </span>

        {TOOL_DEFS.map((tool) => {
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              disabled={isLocked && tool.id !== TOOLS.SELECT}
              onClick={() => onSelectTool(tool.id)}
              title={`${tool.label}${tool.desc ? ` - ${tool.desc}` : ''} (${tool.shortcut})`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '3px',
                fontSize: '11px',
                fontWeight: isActive ? 700 : 500,
                border: isActive ? '1.5px solid var(--black)' : '1px solid var(--border)',
                background: isActive ? 'var(--black)' : '#fff',
                color: isActive ? '#fff' : 'var(--near-black)',
                cursor: isLocked && tool.id !== TOOLS.SELECT ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '13px' }}>{tool.icon}</span>
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      {/* Group 2: Color, Stroke & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {/* Color Palette */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Color:
          </span>
          {COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onChangeColor(c.hex)}
              title={c.label}
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: c.hex,
                border: activeColor === c.hex ? '2.5px solid var(--black)' : '1px solid #ccc',
                cursor: 'pointer',
                padding: 0,
                outline: 'none',
                transform: activeColor === c.hex ? 'scale(1.2)' : 'scale(1)',
                transition: 'transform 0.15s ease',
              }}
            />
          ))}
        </div>

        {/* Stroke Width */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>
            Line:
          </span>
          {[1.5, 2.5, 4].map((width) => (
            <button
              key={width}
              type="button"
              onClick={() => onChangeStroke(width)}
              style={{
                padding: '3px 8px',
                fontSize: '10px',
                fontWeight: activeStroke === width ? 700 : 400,
                border: activeStroke === width ? '1.5px solid var(--black)' : '1px solid var(--border)',
                background: activeStroke === width ? 'var(--near-white)' : '#fff',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              {width === 1.5 ? 'Thin' : width === 2.5 ? 'Medium' : 'Thick'}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '22px', background: 'var(--border)' }} />

        {/* Orientation Switcher */}
        {onToggleOrientation && (
          <button
            type="button"
            onClick={onToggleOrientation}
            className="del-btn"
            style={{ fontSize: '10px', padding: '5px 10px', borderColor: 'var(--border)' }}
            title="Toggle between A4 Landscape and Portrait"
          >
            {orientation === 'portrait' ? '▥ Portrait' : '▤ Landscape'}
          </button>
        )}

        {/* Undo / Redo */}
        <div style={{ display: 'flex', gap: '2px' }}>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="del-btn"
            style={{
              padding: '5px 8px',
              fontSize: '11px',
              borderColor: 'var(--border)',
              opacity: canUndo ? 1 : 0.4,
              cursor: canUndo ? 'pointer' : 'default',
            }}
            title="Undo (Ctrl+Z)"
          >
            ↩ Undo
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="del-btn"
            style={{
              padding: '5px 8px',
              fontSize: '11px',
              borderColor: 'var(--border)',
              opacity: canRedo ? 1 : 0.4,
              cursor: canRedo ? 'pointer' : 'default',
            }}
            title="Redo (Ctrl+Y)"
          >
            ↪ Redo
          </button>
        </div>

        {/* Delete button */}
        {hasSelection && (
          <button
            type="button"
            onClick={onDeleteSelected}
            style={{
              padding: '5px 10px',
              fontSize: '10px',
              fontWeight: 700,
              background: '#fff0f0',
              border: '1px solid #ff8888',
              color: '#d63031',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
            title="Delete selected annotation (Delete / Backspace)"
          >
            🗑 Delete
          </button>
        )}
      </div>
    </div>
  );
}
