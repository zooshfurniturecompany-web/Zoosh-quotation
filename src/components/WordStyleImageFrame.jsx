import React, { useState, useRef, useEffect } from 'react';

/**
 * WordStyleImageFrame:
 * Provides direct, in-screen Microsoft Word & WordPress style interactive image selection,
 * 8-handle cropping, and drag-to-pan repositioning for ALL images without any obscuring popups.
 */
export default function WordStyleImageFrame({
  imageSrc,
  originalSrc = null,
  label = 'Picture',
  panX = 50,
  panY = 50,
  zoom = 1,
  fit = 'cover',
  isLocked = false,
  readOnly = false,
  onUpdateCrop,
  onResetOriginal,
  onToggleFit,
  onToggleLock,
  onRemove,
  onMoveEarlier,
  onMoveLater,
  extraToolbar = null,
  children = null, // Can wrap AnnotationCanvas or custom content
  height = '100%',
  style = {},
}) {
  const containerRef = useRef(null);
  const [isSelected, setIsSelected] = useState(false);
  const [mode, setMode] = useState('crop'); // 'crop' | 'pan'
  const [localPan, setLocalPan] = useState({ x: panX, y: panY });
  const [localZoom, setLocalZoom] = useState(zoom);
  const [cropInsets, setCropInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [isDraggingHandle, setIsDraggingHandle] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, insets: { top: 0, right: 0, bottom: 0, left: 0 }, pan: { x: 50, y: 50 } });

  useEffect(() => {
    setLocalPan({ x: panX, y: panY });
  }, [panX, panY]);

  useEffect(() => {
    setLocalZoom(zoom);
  }, [zoom]);

  // Click outside to deselect
  useEffect(() => {
    const handleDocumentClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        if (isSelected) {
          handleCommitChanges();
          setIsSelected(false);
        }
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, [isSelected, localPan, localZoom, cropInsets]);

  // Mouse move and mouse up handlers for handle dragging and panning
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isSelected) return;

      if (isDraggingHandle && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const deltaX = ((e.clientX - dragStartRef.current.x) / rect.width) * 100;
        const deltaY = ((e.clientY - dragStartRef.current.y) / rect.height) * 100;
        const init = dragStartRef.current.insets;

        let nextInsets = { ...cropInsets };

        if (isDraggingHandle.includes('t')) {
          nextInsets.top = Math.max(0, Math.min(80, init.top + deltaY));
        }
        if (isDraggingHandle.includes('b')) {
          nextInsets.bottom = Math.max(0, Math.min(80, init.bottom - deltaY));
        }
        if (isDraggingHandle.includes('l')) {
          nextInsets.left = Math.max(0, Math.min(80, init.left + deltaX));
        }
        if (isDraggingHandle.includes('r')) {
          nextInsets.right = Math.max(0, Math.min(80, init.right - deltaX));
        }

        setCropInsets(nextInsets);
      } else if (isPanning && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const deltaX = ((e.clientX - dragStartRef.current.x) / rect.width) * 100;
        const deltaY = ((e.clientY - dragStartRef.current.y) / rect.height) * 100;

        setLocalPan({
          x: Math.max(0, Math.min(100, dragStartRef.current.pan.x - deltaX)),
          y: Math.max(0, Math.min(100, dragStartRef.current.pan.y - deltaY)),
        });
      }
    };

    const handleMouseUp = () => {
      if (isDraggingHandle) {
        setIsDraggingHandle(null);
      }
      if (isPanning) {
        setIsPanning(false);
      }
    };

    if (isDraggingHandle || isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingHandle, isPanning, isSelected, cropInsets]);

  const handleStartHandleDrag = (handleName, e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingHandle(handleName);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      insets: { ...cropInsets },
      pan: { ...localPan },
    };
  };

  const handleStartPan = (e) => {
    if (readOnly || isLocked) return;
    if (mode === 'pan' || e.shiftKey) {
      e.preventDefault();
      setIsPanning(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        insets: { ...cropInsets },
        pan: { ...localPan },
      };
    }
  };

  const handleCommitChanges = async () => {
    // If insets were adjusted, bake cropped image onto canvas
    if (
      cropInsets.top > 0 ||
      cropInsets.right > 0 ||
      cropInsets.bottom > 0 ||
      cropInsets.left > 0
    ) {
      const bakedUrl = await bakeCroppedImage();
      if (bakedUrl && onUpdateCrop) {
        onUpdateCrop({
          croppedUrl: bakedUrl,
          pan: { x: 50, y: 50 },
          zoom: 1,
        });
        setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 });
        setLocalPan({ x: 50, y: 50 });
        setLocalZoom(1);
        return;
      }
    }

    // Otherwise update pan and zoom
    if (onUpdateCrop) {
      onUpdateCrop({
        pan: localPan,
        zoom: localZoom,
      });
    }
  };

  const bakeCroppedImage = () => {
    return new Promise((resolve) => {
      if (!imageSrc) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;

        const cropX = (cropInsets.left / 100) * natW;
        const cropY = (cropInsets.top / 100) * natH;
        const cropW = Math.max(10, natW - cropX - (cropInsets.right / 100) * natW);
        const cropH = Math.max(10, natH - cropY - (cropInsets.bottom / 100) * natH);

        const canvas = document.createElement('canvas');
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(null);
      img.src = imageSrc;
    });
  };

  const handleReset = () => {
    setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 });
    setLocalPan({ x: 50, y: 50 });
    setLocalZoom(1);
    if (onResetOriginal) {
      onResetOriginal();
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={() => {
        if (!readOnly && !isLocked && !isSelected) {
          setIsSelected(true);
        }
      }}
      style={{
        position: 'relative',
        width: '100%',
        height: height || '100%',
        background: '#fafafa',
        boxSizing: 'border-box',
        overflow: isSelected ? 'visible' : 'hidden',
        border: isSelected ? '2px solid #2b579a' : '1px solid #d1d5db',
        cursor: isSelected ? (mode === 'pan' ? (isPanning ? 'grabbing' : 'grab') : 'default') : 'pointer',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* WordPress & Word Style Floating Ribbon Toolbar (when selected) */}
      {isSelected && !readOnly && (
        <div
          className="no-print"
          style={{
            position: 'absolute',
            top: '-38px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(24, 24, 27, 0.96)',
            backdropFilter: 'blur(6px)',
            color: '#ffffff',
            padding: '3px 8px',
            borderRadius: '20px',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            zIndex: 100,
            fontSize: '10px',
            whiteSpace: 'nowrap',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span style={{ fontWeight: 700, color: '#93c5fd', padding: '0 4px', borderRight: '1px solid #444' }}>
            {label}
          </span>

          <button
            type="button"
            onClick={() => setMode('crop')}
            style={{
              background: mode === 'crop' ? '#2b579a' : 'transparent',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '10px',
              fontWeight: mode === 'crop' ? 700 : 400,
              cursor: 'pointer',
            }}
            title="Drag 8 edge handles to crop boundaries"
          >
            ✂️ Crop Handles
          </button>

          <button
            type="button"
            onClick={() => setMode('pan')}
            style={{
              background: mode === 'pan' ? '#2b579a' : 'transparent',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              padding: '2px 8px',
              fontSize: '10px',
              fontWeight: mode === 'pan' ? 700 : 400,
              cursor: 'pointer',
            }}
            title="Click and drag image to move/reposition inside frame"
          >
            ✋ Move / Pan
          </button>

          {onToggleFit && (
            <button
              type="button"
              onClick={onToggleFit}
              style={{
                background: 'transparent',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                padding: '2px 6px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
              title="Toggle Fill Frame (No blank space) or Fit"
            >
              {fit === 'cover' ? '🔲 Fill Frame' : '🖼 Fit Image'}
            </button>
          )}

          {(originalSrc || localPan.x !== 50 || localPan.y !== 50 || localZoom !== 1 || cropInsets.top > 0) && (
            <button
              type="button"
              onClick={handleReset}
              style={{
                background: 'transparent',
                color: '#f87171',
                border: 'none',
                borderRadius: '12px',
                padding: '2px 6px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
              title="Reset to original image"
            >
              ↺ Reset
            </button>
          )}

          {onToggleLock && (
            <button
              type="button"
              onClick={onToggleLock}
              style={{
                background: 'transparent',
                color: '#ffffff',
                border: 'none',
                padding: '2px 4px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
              title={isLocked ? 'Locked' : 'Unlocked'}
            >
              {isLocked ? '🔒' : '🔓'}
            </button>
          )}

          {extraToolbar}

          <button
            type="button"
            onClick={() => {
              handleCommitChanges();
              setIsSelected(false);
            }}
            style={{
              background: '#16a34a',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              padding: '2px 10px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              marginLeft: '4px',
            }}
          >
            ✓ Done
          </button>
        </div>
      )}

      {/* Main Image Viewport Area (Zero Blank Spaces) */}
      <div
        onMouseDown={handleStartPan}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          clipPath:
            cropInsets.top > 0 || cropInsets.right > 0 || cropInsets.bottom > 0 || cropInsets.left > 0
              ? `inset(${cropInsets.top}% ${cropInsets.right}% ${cropInsets.bottom}% ${cropInsets.left}%)`
              : 'none',
        }}
      >
        {children ? (
          children
        ) : imageSrc ? (
          <img
            src={imageSrc}
            alt={label}
            style={{
              width: '100%',
              height: '100%',
              objectFit: fit || 'cover',
              objectPosition: `${localPan.x}% ${localPan.y}%`,
              transform: localZoom !== 1 ? `scale(${localZoom})` : 'none',
              display: 'block',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: '11px' }}>
            No image attached
          </div>
        )}
      </div>

      {/* Word-Style Top Label Tag (when not selected) */}
      {!isSelected && (
        <div
          style={{
            position: 'absolute',
            top: '6px',
            left: '6px',
            background: 'rgba(255, 255, 255, 0.92)',
            padding: '2px 6px',
            fontSize: '9px',
            fontWeight: 700,
            color: '#333333',
            border: '1px solid #d1d5db',
            borderRadius: '2px',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {label}
        </div>
      )}

      {/* Reorder / Delete shortcuts in top-right when hovering (hidden on print) */}
      {!isSelected && !readOnly && !isLocked && (
        <div
          className="no-print"
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            display: 'flex',
            gap: '3px',
            zIndex: 15,
          }}
        >
          {onMoveEarlier && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveEarlier();
              }}
              style={{ background: '#fff', border: '1px solid #ccc', padding: '1px 4px', fontSize: '8px', cursor: 'pointer', borderRadius: '2px' }}
              title="Move earlier"
            >
              ◀
            </button>
          )}
          {onMoveLater && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveLater();
              }}
              style={{ background: '#fff', border: '1px solid #ccc', padding: '1px 4px', fontSize: '8px', cursor: 'pointer', borderRadius: '2px' }}
              title="Move later"
            >
              ▶
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              style={{ background: '#fff', border: '1px solid #ccc', color: '#ff5555', padding: '1px 4px', fontSize: '9px', cursor: 'pointer', borderRadius: '2px' }}
              title="Remove view"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Word-Style 8 Circular Drag Handles (Active when Selected) */}
      {isSelected && !readOnly && (
        <>
          {/* Top Rotation Stem and Icon */}
          <div
            style={{
              position: 'absolute',
              top: '-20px',
              left: '50%',
              width: '1px',
              height: '20px',
              background: '#2b579a',
              pointerEvents: 'none',
              zIndex: 30,
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '-32px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid #2b579a',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              cursor: 'grab',
              zIndex: 35,
              color: '#2b579a',
            }}
            title="Rotate / Reposition"
            onClick={(e) => {
              e.stopPropagation();
              setMode(mode === 'pan' ? 'crop' : 'pan');
            }}
          >
            ↻
          </div>

          {/* 1. Top-Left Handle */}
          <div
            onMouseDown={(e) => handleStartHandleDrag('tl', e)}
            style={{
              position: 'absolute',
              top: '-5px',
              left: '-5px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid #2b579a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
              cursor: 'nwse-resize',
              zIndex: 40,
            }}
          />

          {/* 2. Top-Center Handle */}
          <div
            onMouseDown={(e) => handleStartHandleDrag('t', e)}
            style={{
              position: 'absolute',
              top: '-5px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid #2b579a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
              cursor: 'ns-resize',
              zIndex: 40,
            }}
          />

          {/* 3. Top-Right Handle */}
          <div
            onMouseDown={(e) => handleStartHandleDrag('tr', e)}
            style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid #2b579a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
              cursor: 'nesw-resize',
              zIndex: 40,
            }}
          />

          {/* 4. Right-Center Handle */}
          <div
            onMouseDown={(e) => handleStartHandleDrag('r', e)}
            style={{
              position: 'absolute',
              top: '50%',
              right: '-5px',
              transform: 'translateY(-50%)',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid #2b579a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
              cursor: 'ew-resize',
              zIndex: 40,
            }}
          />

          {/* 5. Bottom-Right Handle */}
          <div
            onMouseDown={(e) => handleStartHandleDrag('br', e)}
            style={{
              position: 'absolute',
              bottom: '-5px',
              right: '-5px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid #2b579a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
              cursor: 'nwse-resize',
              zIndex: 40,
            }}
          />

          {/* 6. Bottom-Center Handle */}
          <div
            onMouseDown={(e) => handleStartHandleDrag('b', e)}
            style={{
              position: 'absolute',
              bottom: '-5px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid #2b579a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
              cursor: 'ns-resize',
              zIndex: 40,
            }}
          />

          {/* 7. Bottom-Left Handle */}
          <div
            onMouseDown={(e) => handleStartHandleDrag('bl', e)}
            style={{
              position: 'absolute',
              bottom: '-5px',
              left: '-5px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid #2b579a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
              cursor: 'nesw-resize',
              zIndex: 40,
            }}
          />

          {/* 8. Left-Center Handle */}
          <div
            onMouseDown={(e) => handleStartHandleDrag('l', e)}
            style={{
              position: 'absolute',
              top: '50%',
              left: '-5px',
              transform: 'translateY(-50%)',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#ffffff',
              border: '1.5px solid #2b579a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
              cursor: 'ew-resize',
              zIndex: 40,
            }}
          />
        </>
      )}
    </div>
  );
}
