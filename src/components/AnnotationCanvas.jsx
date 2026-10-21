import React, { useState, useRef, useEffect } from 'react';
import { TOOLS } from './ReviewToolbar';

export default function AnnotationCanvas({
  imageSrc,
  annotations = [],
  onChangeAnnotations,
  activeTool = TOOLS.SELECT,
  activeColor = '#e74c3c',
  activeStroke = 2,
  isLocked = false,
  isReadOnly = false,
  onApproveProduct,
  fit = 'cover',
  panX = 50,
  panY = 50,
  zoom = 1,
}) {
  const containerRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [drawingState, setDrawingState] = useState(null); // { type, startX, startY, currentX, currentY, points }
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');

  // Dragging existing annotation state (stored temporarily until mouseUp to avoid flooding undo stack)
  const [dragState, setDragState] = useState(null); // { id, startX, startY, origX1, origY1, origX2, origY2, dx, dy }

  // Keyboard shortcut for Delete
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (editingId || isReadOnly || isLocked) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        onChangeAnnotations(annotations.filter((a) => a.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, annotations, editingId, isReadOnly, isLocked]);

  // Convert mouse event coordinates to percentage relative to container
  const getRelativeCoords = (e) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)) };
  };

  // Mouse Down handler
  const handleMouseDown = (e) => {
    if (isReadOnly || isLocked) return;
    const coords = getRelativeCoords(e);

    // If active tool is SELECT, handled by clicking on items
    if (activeTool === TOOLS.SELECT) {
      return;
    }

    if (activeTool === TOOLS.HIGHLIGHT) {
      setDrawingState({
        type: TOOLS.HIGHLIGHT,
        points: [coords],
        color: activeColor,
        strokeWidth: activeStroke * 3,
      });
      return;
    }

    if (activeTool === TOOLS.TEXT) {
      const newAnn = {
        id: `ann-txt-${Date.now()}`,
        type: TOOLS.TEXT,
        x1: coords.x,
        y1: coords.y,
        text: 'Type instruction here...',
        color: activeColor,
        fontSize: 12,
      };
      onChangeAnnotations([...annotations, newAnn]);
      setSelectedId(newAnn.id);
      setEditingId(newAnn.id);
      setEditText(newAnn.text);
      return;
    }

    if (activeTool === TOOLS.STAMP) {
      const newAnn = {
        id: `ann-stamp-${Date.now()}`,
        type: TOOLS.STAMP,
        x1: coords.x,
        y1: coords.y,
        text: 'APPROVED FOR PRODUCTION',
        dateStr: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase(),
        signatory: 'Production Manager',
        color: '#27ae60',
      };
      onChangeAnnotations([...annotations, newAnn]);
      setSelectedId(newAnn.id);
      if (onApproveProduct) onApproveProduct();
      return;
    }

    // Two-point tools: Dimension, Box, Leader, Terminator, Callout, Circle, Magnifier
    setDrawingState({
      type: activeTool,
      startX: coords.x,
      startY: coords.y,
      currentX: coords.x,
      currentY: coords.y,
      color: activeColor,
      strokeWidth: activeStroke,
    });
  };

  // Mouse Move handler
  const handleMouseMove = (e) => {
    if (dragState) {
      const coords = getRelativeCoords(e);
      const dx = coords.x - dragState.startX;
      const dy = coords.y - dragState.startY;
      setDragState((prev) => (prev ? { ...prev, dx, dy } : null));
      return;
    }

    if (!drawingState) return;
    const coords = getRelativeCoords(e);

    if (drawingState.type === TOOLS.HIGHLIGHT) {
      setDrawingState((prev) => ({
        ...prev,
        points: [...prev.points, coords],
      }));
    } else {
      setDrawingState((prev) => ({
        ...prev,
        currentX: coords.x,
        currentY: coords.y,
      }));
    }
  };

  // Mouse Up handler
  const handleMouseUp = (e) => {
    if (dragState) {
      const { id, origX1, origY1, origX2, origY2, dx, dy } = dragState;
      setDragState(null);
      if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
        onChangeAnnotations(
          annotations.map((ann) => {
            if (ann.id !== id) return ann;
            return {
              ...ann,
              x1: parseFloat((origX1 + dx).toFixed(2)),
              y1: parseFloat((origY1 + dy).toFixed(2)),
              x2: ann.x2 !== undefined ? parseFloat((origX2 + dx).toFixed(2)) : undefined,
              y2: ann.y2 !== undefined ? parseFloat((origY2 + dy).toFixed(2)) : undefined,
            };
          })
        );
      }
      return;
    }

    if (!drawingState) return;

    const dx = Math.abs(drawingState.currentX - drawingState.startX);
    const dy = Math.abs(drawingState.currentY - drawingState.startY);

    // Filter tiny clicks
    if (drawingState.type !== TOOLS.HIGHLIGHT && dx < 1 && dy < 1) {
      setDrawingState(null);
      return;
    }

    let newAnn = null;
    const baseId = `ann-${Date.now()}`;

    switch (drawingState.type) {
      case TOOLS.DIMENSION: {
        // Calculate approximate visual distance in cm
        const distPx = Math.sqrt(dx * dx + dy * dy);
        const defaultCm = Math.round(distPx * 2.5) || 75;
        newAnn = {
          id: `${baseId}-dim`,
          type: TOOLS.DIMENSION,
          x1: drawingState.startX,
          y1: drawingState.startY,
          x2: drawingState.currentX,
          y2: drawingState.currentY,
          text: `${defaultCm} cm`,
          color: drawingState.color,
          strokeWidth: drawingState.strokeWidth,
        };
        break;
      }
      case TOOLS.BOX: {
        newAnn = {
          id: `${baseId}-box`,
          type: TOOLS.BOX,
          x1: Math.min(drawingState.startX, drawingState.currentX),
          y1: Math.min(drawingState.startY, drawingState.currentY),
          x2: Math.max(drawingState.startX, drawingState.currentX),
          y2: Math.max(drawingState.startY, drawingState.currentY),
          text: '',
          color: drawingState.color,
          strokeWidth: drawingState.strokeWidth,
        };
        break;
      }
      case TOOLS.LEADER: {
        newAnn = {
          id: `${baseId}-ldr`,
          type: TOOLS.LEADER,
          x1: drawingState.startX,
          y1: drawingState.startY,
          x2: drawingState.currentX,
          y2: drawingState.currentY,
          text: 'Note details',
          color: drawingState.color,
          strokeWidth: drawingState.strokeWidth,
        };
        break;
      }
      case TOOLS.TERMINATOR: {
        newAnn = {
          id: `${baseId}-term`,
          type: TOOLS.TERMINATOR,
          x1: drawingState.startX,
          y1: drawingState.startY,
          x2: drawingState.currentX,
          y2: drawingState.currentY,
          text: 'Joint specification',
          color: drawingState.color,
          strokeWidth: drawingState.strokeWidth,
        };
        break;
      }
      case TOOLS.CALLOUT: {
        newAnn = {
          id: `${baseId}-call`,
          type: TOOLS.CALLOUT,
          x1: drawingState.startX,
          y1: drawingState.startY,
          x2: drawingState.currentX,
          y2: drawingState.currentY,
          text: 'Cushioning detail',
          color: drawingState.color,
          strokeWidth: drawingState.strokeWidth,
        };
        break;
      }
      case TOOLS.CIRCLE: {
        newAnn = {
          id: `${baseId}-circ`,
          type: TOOLS.CIRCLE,
          x1: Math.min(drawingState.startX, drawingState.currentX),
          y1: Math.min(drawingState.startY, drawingState.currentY),
          x2: Math.max(drawingState.startX, drawingState.currentX),
          y2: Math.max(drawingState.startY, drawingState.currentY),
          color: drawingState.color,
          strokeWidth: drawingState.strokeWidth,
        };
        break;
      }
      case TOOLS.MAGNIFIER: {
        newAnn = {
          id: `${baseId}-mag`,
          type: TOOLS.MAGNIFIER,
          x1: drawingState.startX,
          y1: drawingState.startY,
          x2: drawingState.currentX,
          y2: drawingState.currentY,
          radius: Math.max(8, Math.min(25, Math.hypot(dx, dy) / 2)),
          zoom: 2,
          color: drawingState.color,
        };
        break;
      }
      case TOOLS.HIGHLIGHT: {
        if (drawingState.points.length > 1) {
          newAnn = {
            id: `${baseId}-high`,
            type: TOOLS.HIGHLIGHT,
            points: drawingState.points,
            color: 'rgba(255, 235, 59, 0.45)',
            strokeWidth: 14,
          };
        }
        break;
      }
      default:
        break;
    }

    if (newAnn) {
      onChangeAnnotations([...annotations, newAnn]);
      setSelectedId(newAnn.id);
    }
    setDrawingState(null);
  };

  // Start dragging an annotation
  const handleStartDrag = (e, ann) => {
    e.stopPropagation();
    if (isReadOnly || isLocked) return;
    setSelectedId(ann.id);
    const coords = getRelativeCoords(e);
    setDragState({
      id: ann.id,
      startX: coords.x,
      startY: coords.y,
      origX1: ann.x1,
      origY1: ann.y1,
      origX2: ann.x2 !== undefined ? ann.x2 : ann.x1,
      origY2: ann.y2 !== undefined ? ann.y2 : ann.y1,
      dx: 0,
      dy: 0,
    });
  };

  // Inline edit submission
  const handleCommitEdit = (id) => {
    onChangeAnnotations(
      annotations.map((a) => (a.id === id ? { ...a, text: editText } : a))
    );
    setEditingId(null);
  };

  // Triple click removal for stamp
  const handleStampClick = (e, ann) => {
    e.stopPropagation();
    if (e.detail === 3) {
      if (confirm('Triple-click detected: Revoke production approval and remove this stamp?')) {
        onChangeAnnotations(annotations.filter((a) => a.id !== ann.id));
      }
    } else {
      setSelectedId(ann.id);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#f8f9fa',
        border: '1px solid var(--border)',
        borderRadius: '2px',
        overflow: 'hidden',
        userSelect: 'none',
        cursor:
          isLocked || isReadOnly
            ? 'default'
            : activeTool === TOOLS.SELECT
            ? 'default'
            : activeTool === TOOLS.HIGHLIGHT
            ? 'crosshair'
            : 'crosshair',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Background Furniture Reference Image */}
      {imageSrc ? (
        <img
          src={imageSrc}
          alt="Product Reference"
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit || 'cover',
            objectPosition: `${panX ?? 50}% ${panY ?? 50}%`,
            transform: zoom && zoom !== 1 ? `scale(${zoom})` : 'none',
            transformOrigin: `${panX ?? 50}% ${panY ?? 50}%`,
            pointerEvents: 'none',
            display: 'block',
          }}
        />
      ) : (
        <div style={{ color: 'var(--gray)', fontSize: '12px', fontStyle: 'italic' }}>
          No reference image available
        </div>
      )}

      {/* Interactive Vector SVG Overlay */}
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <marker
            id="arrowhead-red"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
          >
            <polygon points="0 0, 8 4, 0 8" fill="#e74c3c" />
          </marker>
          <marker
            id="arrowhead-start-red"
            markerWidth="8"
            markerHeight="8"
            refX="2"
            refY="4"
            orient="auto"
          >
            <polygon points="8 0, 0 4, 8 8" fill="#e74c3c" />
          </marker>
          <marker
            id="arrowhead-generic"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
          >
            <polygon points="0 0, 8 4, 0 8" fill={activeColor} />
          </marker>
        </defs>

        {/* Existing Annotations */}
        {annotations.map((rawAnn) => {
          const ann = (dragState && dragState.id === rawAnn.id)
            ? {
                ...rawAnn,
                x1: parseFloat((dragState.origX1 + dragState.dx).toFixed(2)),
                y1: parseFloat((dragState.origY1 + dragState.dy).toFixed(2)),
                x2: rawAnn.x2 !== undefined ? parseFloat((dragState.origX2 + dragState.dx).toFixed(2)) : undefined,
                y2: rawAnn.y2 !== undefined ? parseFloat((dragState.origY2 + dragState.dy).toFixed(2)) : undefined,
              }
            : rawAnn;
          const isSel = selectedId === ann.id;
          const stroke = ann.color || '#e74c3c';
          const sw = ann.strokeWidth || 2;

          switch (ann.type) {
            case TOOLS.DIMENSION: {
              const midX = (ann.x1 + ann.x2) / 2;
              const midY = (ann.y1 + ann.y2) / 2;
              return (
                <g key={ann.id} style={{ pointerEvents: 'auto', cursor: 'move' }} onMouseDown={(e) => handleStartDrag(e, ann)}>
                  {/* Dimension leader line with arrowheads */}
                  <line
                    x1={`${ann.x1}%`}
                    y1={`${ann.y1}%`}
                    x2={`${ann.x2}%`}
                    y2={`${ann.y2}%`}
                    stroke={stroke}
                    strokeWidth={sw}
                    markerEnd="url(#arrowhead-red)"
                    markerStart="url(#arrowhead-start-red)"
                  />
                  {/* Perpendicular boundary ticks */}
                  <circle cx={`${ann.x1}%`} cy={`${ann.y1}%`} r={3} fill={stroke} />
                  <circle cx={`${ann.x2}%`} cy={`${ann.y2}%`} r={3} fill={stroke} />

                  {/* Centered White Rectangular Label Box with Red Border */}
                  <foreignObject
                    x={`calc(${midX}% - 45px)`}
                    y={`calc(${midY}% - 14px)`}
                    width="90"
                    height="28"
                    style={{ overflow: 'visible' }}
                  >
                    <div
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingId(ann.id);
                        setEditText(ann.text || '');
                      }}
                      style={{
                        background: '#ffffff',
                        border: '1.5px solid #e74c3c',
                        borderRadius: '2px',
                        padding: '2px 6px',
                        textAlign: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#111111',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {editingId === ann.id ? (
                        <input
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onBlur={() => handleCommitEdit(ann.id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCommitEdit(ann.id)}
                          style={{ width: '60px', fontSize: '10px', textAlign: 'center', border: 'none', outline: 'none' }}
                        />
                      ) : (
                        <span>{ann.text || '120 cm'}</span>
                      )}
                    </div>
                  </foreignObject>
                </g>
              );
            }

            case TOOLS.BOX: {
              const x = Math.min(ann.x1, ann.x2);
              const y = Math.min(ann.y1, ann.y2);
              const w = Math.abs(ann.x2 - ann.x1);
              const h = Math.abs(ann.y2 - ann.y1);
              return (
                <g key={ann.id} style={{ pointerEvents: 'auto', cursor: 'move' }} onMouseDown={(e) => handleStartDrag(e, ann)}>
                  <rect
                    x={`${x}%`}
                    y={`${y}%`}
                    width={`${w}%`}
                    height={`${h}%`}
                    fill="rgba(231, 76, 60, 0.08)"
                    stroke={stroke}
                    strokeWidth={sw}
                    strokeDasharray={isSel ? '4 2' : 'none'}
                  />
                  {ann.text && (
                    <foreignObject x={`${x}%`} y={`calc(${y}% - 20px)`} width="150" height="24">
                      <div
                        style={{
                          background: stroke,
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '2px',
                          display: 'inline-block',
                        }}
                      >
                        {ann.text}
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            }

            case TOOLS.LEADER: {
              return (
                <g key={ann.id} style={{ pointerEvents: 'auto', cursor: 'move' }} onMouseDown={(e) => handleStartDrag(e, ann)}>
                  <line
                    x1={`${ann.x1}%`}
                    y1={`${ann.y1}%`}
                    x2={`${ann.x2}%`}
                    y2={`${ann.y2}%`}
                    stroke={stroke}
                    strokeWidth={sw}
                    markerStart="url(#arrowhead-start-red)"
                  />
                  <foreignObject x={`calc(${ann.x2}% - 50px)`} y={`calc(${ann.y2}% - 12px)`} width="120" height="26">
                    <div
                      onDoubleClick={() => {
                        setEditingId(ann.id);
                        setEditText(ann.text);
                      }}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #333',
                        padding: '2px 6px',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#111',
                        borderRadius: '2px',
                      }}
                    >
                      {editingId === ann.id ? (
                        <input
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onBlur={() => handleCommitEdit(ann.id)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCommitEdit(ann.id)}
                          style={{ width: '90px', fontSize: '10px', border: 'none' }}
                        />
                      ) : (
                        ann.text
                      )}
                    </div>
                  </foreignObject>
                </g>
              );
            }

            case TOOLS.TERMINATOR: {
              return (
                <g key={ann.id} style={{ pointerEvents: 'auto', cursor: 'move' }} onMouseDown={(e) => handleStartDrag(e, ann)}>
                  {/* Anchor Point Dot */}
                  <circle cx={`${ann.x1}%`} cy={`${ann.y1}%`} r={4} fill={stroke} />
                  <line x1={`${ann.x1}%`} y1={`${ann.y1}%`} x2={`${ann.x2}%`} y2={`${ann.y2}%`} stroke={stroke} strokeWidth={sw} />
                  <foreignObject x={`${ann.x2}%`} y={`calc(${ann.y2}% - 10px)`} width="140" height="28">
                    <div
                      style={{
                        background: '#ffffff',
                        border: `1px solid ${stroke}`,
                        padding: '2px 8px',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#111',
                        borderRadius: '2px',
                      }}
                    >
                      {ann.text}
                    </div>
                  </foreignObject>
                </g>
              );
            }

            case TOOLS.CALLOUT: {
              return (
                <g key={ann.id} style={{ pointerEvents: 'auto', cursor: 'move' }} onMouseDown={(e) => handleStartDrag(e, ann)}>
                  <line x1={`${ann.x1}%`} y1={`${ann.y1}%`} x2={`${ann.x2}%`} y2={`${ann.y2}%`} stroke={stroke} strokeWidth={1} strokeDasharray="2 2" />
                  <foreignObject x={`calc(${ann.x2}% - 60px)`} y={`calc(${ann.y2}% - 15px)`} width="140" height="40">
                    <div
                      style={{
                        background: 'rgba(255,255,255,0.95)',
                        border: `1.5px solid ${stroke}`,
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontStyle: 'italic',
                        color: '#111',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                      }}
                    >
                      💬 {ann.text}
                    </div>
                  </foreignObject>
                </g>
              );
            }

            case TOOLS.CIRCLE: {
              const cx = (ann.x1 + ann.x2) / 2;
              const cy = (ann.y1 + ann.y2) / 2;
              const rx = Math.abs(ann.x2 - ann.x1) / 2;
              const ry = Math.abs(ann.y2 - ann.y1) / 2;
              return (
                <g key={ann.id} style={{ pointerEvents: 'auto', cursor: 'move' }} onMouseDown={(e) => handleStartDrag(e, ann)}>
                  <ellipse
                    cx={`${cx}%`}
                    cy={`${cy}%`}
                    rx={`${rx}%`}
                    ry={`${ry}%`}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={sw}
                    strokeDasharray={isSel ? '4 2' : 'none'}
                  />
                </g>
              );
            }

            case TOOLS.HIGHLIGHT: {
              if (!ann.points || ann.points.length === 0) return null;
              const pathData = ann.points.reduce(
                (acc, pt, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x}% ${pt.y}%`,
                ''
              );
              return (
                <path
                  key={ann.id}
                  d={pathData}
                  fill="none"
                  stroke={ann.color || 'rgba(255, 235, 59, 0.45)'}
                  strokeWidth={ann.strokeWidth || 14}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                  onClick={() => setSelectedId(ann.id)}
                />
              );
            }

            case TOOLS.TEXT: {
              return (
                <foreignObject
                  key={ann.id}
                  x={`${ann.x1}%`}
                  y={`${ann.y1}%`}
                  width="180"
                  height="60"
                  style={{ pointerEvents: 'auto', overflow: 'visible', cursor: 'move' }}
                  onMouseDown={(e) => handleStartDrag(e, ann)}
                >
                  <div
                    onDoubleClick={() => {
                      setEditingId(ann.id);
                      setEditText(ann.text);
                    }}
                    style={{
                      background: 'rgba(255,255,255,0.95)',
                      border: isSel ? '1.5px dashed var(--black)' : '1px solid #999',
                      padding: '4px 8px',
                      borderRadius: '2px',
                      fontSize: '11px',
                      color: stroke,
                      fontWeight: 600,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    }}
                  >
                    {editingId === ann.id ? (
                      <textarea
                        autoFocus
                        rows={2}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={() => handleCommitEdit(ann.id)}
                        style={{ width: '100%', fontSize: '11px', resize: 'none', border: 'none', outline: 'none' }}
                      />
                    ) : (
                      ann.text
                    )}
                  </div>
                </foreignObject>
              );
            }

            case TOOLS.MAGNIFIER: {
              return (
                <g key={ann.id} style={{ pointerEvents: 'auto', cursor: 'move' }} onMouseDown={(e) => handleStartDrag(e, ann)}>
                  {/* Target Circle on Image */}
                  <circle cx={`${ann.x1}%`} cy={`${ann.y1}%`} r={16} fill="none" stroke="#e74c3c" strokeWidth={2} />
                  <line x1={`${ann.x1}%`} y1={`${ann.y1}%`} x2={`${ann.x2}%`} y2={`${ann.y2}%`} stroke="#e74c3c" strokeWidth={1.5} strokeDasharray="3 2" />
                  {/* Magnified Inset Circle */}
                  <circle cx={`${ann.x2}%`} cy={`${ann.y2}%`} r={32} fill="#ffffff" stroke="#27ae60" strokeWidth={3} />
                  <foreignObject x={`calc(${ann.x2}% - 30px)`} y={`calc(${ann.y2}% - 30px)`} width="60" height="60">
                    <div
                      style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#fff',
                      }}
                    >
                      <img
                        src={imageSrc}
                        alt="Zoom"
                        style={{
                          transform: 'scale(2.5)',
                          transformOrigin: `${ann.x1}% ${ann.y1}%`,
                          maxWidth: 'none',
                        }}
                      />
                    </div>
                  </foreignObject>
                  <text x={`${ann.x2}%`} y={`calc(${ann.y2}% + 42px)`} textAnchor="middle" fontSize="9" fontWeight="700" fill="#27ae60">
                    2× INSET
                  </text>
                </g>
              );
            }

            case TOOLS.STAMP: {
              return (
                <foreignObject
                  key={ann.id}
                  x={`calc(${ann.x1}% - 80px)`}
                  y={`calc(${ann.y1}% - 40px)`}
                  width="160"
                  height="80"
                  style={{ pointerEvents: 'auto', overflow: 'visible', cursor: 'move' }}
                  onMouseDown={(e) => handleStartDrag(e, ann)}
                  onClick={(e) => handleStampClick(e, ann)}
                >
                  <div
                    title="Official Production Stamp (Triple-click to revoke)"
                    style={{
                      border: '3px double #27ae60',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      background: 'rgba(232, 245, 233, 0.92)',
                      color: '#1b5e20',
                      textAlign: 'center',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                      transform: 'rotate(-4deg)',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em' }}>
                      APPROVED FOR PRODUCTION
                    </div>
                    <div style={{ fontSize: '9px', fontWeight: 700, margin: '2px 0' }}>
                      ZOOSH WORKSHOP
                    </div>
                    <div style={{ fontSize: '8px', color: '#2e7d32' }}>
                      {ann.dateStr} &bull; {ann.signatory}
                    </div>
                  </div>
                </foreignObject>
              );
            }

            default:
              return null;
          }
        })}

        {/* Live Drawing Preview */}
        {drawingState && (
          <>
            {drawingState.type === TOOLS.DIMENSION && (
              <>
                <line
                  x1={`${drawingState.startX}%`}
                  y1={`${drawingState.startY}%`}
                  x2={`${drawingState.currentX}%`}
                  y2={`${drawingState.currentY}%`}
                  stroke={drawingState.color}
                  strokeWidth={drawingState.strokeWidth}
                  strokeDasharray="4 2"
                />
                <circle cx={`${drawingState.startX}%`} cy={`${drawingState.startY}%`} r={4} fill={drawingState.color} />
                <circle cx={`${drawingState.currentX}%`} cy={`${drawingState.currentY}%`} r={4} fill={drawingState.color} />
              </>
            )}

            {drawingState.type === TOOLS.BOX && (
              <rect
                x={`${Math.min(drawingState.startX, drawingState.currentX)}%`}
                y={`${Math.min(drawingState.startY, drawingState.currentY)}%`}
                width={`${Math.abs(drawingState.currentX - drawingState.startX)}%`}
                height={`${Math.abs(drawingState.currentY - drawingState.startY)}%`}
                fill="rgba(231, 76, 60, 0.1)"
                stroke={drawingState.color}
                strokeWidth={drawingState.strokeWidth}
                strokeDasharray="3 3"
              />
            )}

            {drawingState.type === TOOLS.CIRCLE && (
              <ellipse
                cx={`${(drawingState.startX + drawingState.currentX) / 2}%`}
                cy={`${(drawingState.startY + drawingState.currentY) / 2}%`}
                rx={`${Math.abs(drawingState.currentX - drawingState.startX) / 2}%`}
                ry={`${Math.abs(drawingState.currentY - drawingState.startY) / 2}%`}
                fill="none"
                stroke={drawingState.color}
                strokeWidth={drawingState.strokeWidth}
                strokeDasharray="3 3"
              />
            )}

            {drawingState.type === TOOLS.HIGHLIGHT && drawingState.points && (
              <path
                d={drawingState.points.reduce(
                  (acc, pt, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${pt.x}% ${pt.y}%`,
                  ''
                )}
                fill="none"
                stroke="rgba(255, 235, 59, 0.55)"
                strokeWidth={14}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </>
        )}
      </svg>
    </div>
  );
}
