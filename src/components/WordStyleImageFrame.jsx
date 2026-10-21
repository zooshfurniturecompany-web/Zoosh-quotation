import React, { useState, useRef, useEffect } from 'react';

/**
 * WordStyleImageFrame:
 * Provides direct, in-screen Microsoft Word style interactive image selection,
 * 8-handle resizing (reduce/enlarge size), boundary cropping, and free drag-to-move repositioning
 * across the entire available workspace area.
 * STRICT REQUIREMENT: NO floating popup windows or hovering bars.
 */
export default function WordStyleImageFrame({
  imageSrc,
  originalSrc = null,
  label = 'Picture',
  panX = 50,
  panY = 50,
  posX = null,
  posY = null,
  zoom = 1,
  scale = 1, // Size scale: 1 = 100%, 0.75 = 75%, 0.5 = 50%, etc.
  fit = 'cover',
  isLocked = false,
  readOnly = false,
  activeTool = null,
  onUpdateCrop,
  onResetOriginal,
  onToggleFit,
  onToggleLock,
  onRemove,
  onMoveEarlier,
  onMoveLater,
  children = null, // Wraps AnnotationCanvas for Picture 1
  height = '100%',
  style = {},
}) {
  const containerRef = useRef(null);
  const [isSelected, setIsSelected] = useState(false);

  // Scale and Position state
  const initialScale = typeof scale === 'number' ? scale : 1;
  const [localScale, setLocalScale] = useState(initialScale);

  // If posX/posY are not provided, default to centering the image based on scale
  const defaultPosX = posX !== null && posX !== undefined ? posX : Math.max(0, (1 - initialScale) * 50);
  const defaultPosY = posY !== null && posY !== undefined ? posY : Math.max(0, (1 - initialScale) * 50);
  const [localPos, setLocalPos] = useState({ x: defaultPosX, y: defaultPosY });

  const [localPan, setLocalPan] = useState({ x: panX ?? 50, y: panY ?? 50 });
  const [cropInsets, setCropInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 });

  const [isMoving, setIsMoving] = useState(false);
  const [isDraggingHandle, setIsDraggingHandle] = useState(null); // 'tl'|'tr'|'br'|'bl'|'t'|'b'|'l'|'r'

  const dragStartRef = useRef({
    startX: 0,
    startY: 0,
    pos: { x: 0, y: 0 },
    scale: 1,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  // Sync props when updated externally
  useEffect(() => {
    if (scale !== undefined && scale !== null) {
      setLocalScale(scale);
    }
  }, [scale]);

  useEffect(() => {
    if (posX !== undefined && posX !== null && posY !== undefined && posY !== null) {
      setLocalPos({ x: posX, y: posY });
    }
  }, [posX, posY]);

  useEffect(() => {
    setLocalPan({ x: panX ?? 50, y: panY ?? 50 });
  }, [panX, panY]);

  // Click outside to deselect and commit changes
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
  }, [isSelected, localPos, localScale, cropInsets, localPan]);

  // Keyboard Nudge (Arrow Keys) when image is selected
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isSelected || readOnly || isLocked) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const maxPosX = Math.max(0, 100 - Math.round(localScale * 100));
        const maxPosY = Math.max(0, 100 - Math.round(localScale * 100));

        let nextX = localPos.x;
        let nextY = localPos.y;

        if (e.key === 'ArrowLeft') nextX = Math.max(0, nextX - step);
        if (e.key === 'ArrowRight') nextX = Math.min(maxPosX, nextX + step);
        if (e.key === 'ArrowUp') nextY = Math.max(0, nextY - step);
        if (e.key === 'ArrowDown') nextY = Math.min(maxPosY, nextY + step);

        const updatedPos = { x: Math.round(nextX * 10) / 10, y: Math.round(nextY * 10) / 10 };
        setLocalPos(updatedPos);

        if (onUpdateCrop) {
          onUpdateCrop({
            position: updatedPos,
            scale: localScale,
            pan: localPan,
          });
        }
      } else if (e.key === 'Escape') {
        setIsSelected(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelected, localPos, localScale, readOnly, isLocked, localPan, onUpdateCrop]);

  // Mouse Move & Mouse Up handlers for Moving, Resizing, and Cropping
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaXPercent = ((e.clientX - dragStartRef.current.startX) / rect.width) * 100;
      const deltaYPercent = ((e.clientY - dragStartRef.current.startY) / rect.height) * 100;

      // 1. FREE MOVE: Dragging image body moves it anywhere within the container area
      if (isMoving) {
        const maxPosX = Math.max(0, 100 - Math.round(localScale * 100));
        const maxPosY = Math.max(0, 100 - Math.round(localScale * 100));

        const nextX = Math.max(0, Math.min(maxPosX, dragStartRef.current.pos.x + deltaXPercent));
        const nextY = Math.max(0, Math.min(maxPosY, dragStartRef.current.pos.y + deltaYPercent));

        setLocalPos({
          x: Math.round(nextX * 10) / 10,
          y: Math.round(nextY * 10) / 10,
        });
      }

      // 2. CORNER HANDLES: Resize/Scale image size
      else if (isDraggingHandle && ['tl', 'tr', 'br', 'bl'].includes(isDraggingHandle)) {
        let scaleDelta = 0;
        if (isDraggingHandle === 'br') {
          scaleDelta = ((deltaXPercent + deltaYPercent) / 2) / 80;
        } else if (isDraggingHandle === 'tl') {
          scaleDelta = -((deltaXPercent + deltaYPercent) / 2) / 80;
        } else if (isDraggingHandle === 'tr') {
          scaleDelta = ((deltaXPercent - deltaYPercent) / 2) / 80;
        } else if (isDraggingHandle === 'bl') {
          scaleDelta = ((-deltaXPercent + deltaYPercent) / 2) / 80;
        }

        const nextScale = Math.max(0.25, Math.min(1.0, dragStartRef.current.scale + scaleDelta));
        const roundedScale = Math.round(nextScale * 100) / 100;
        setLocalScale(roundedScale);

        // Adjust position so image stays within container bounds
        const maxPosX = Math.max(0, 100 - Math.round(roundedScale * 100));
        const maxPosY = Math.max(0, 100 - Math.round(roundedScale * 100));
        setLocalPos((prev) => ({
          x: Math.min(maxPosX, prev.x),
          y: Math.min(maxPosY, prev.y),
        }));
      }

      // 3. EDGE HANDLES: Crop image borders
      else if (isDraggingHandle && ['t', 'b', 'l', 'r'].includes(isDraggingHandle)) {
        const init = dragStartRef.current.insets;
        let nextInsets = { ...cropInsets };

        if (isDraggingHandle === 't') {
          nextInsets.top = Math.max(0, Math.min(75, init.top + deltaYPercent));
        }
        if (isDraggingHandle === 'b') {
          nextInsets.bottom = Math.max(0, Math.min(75, init.bottom - deltaYPercent));
        }
        if (isDraggingHandle === 'l') {
          nextInsets.left = Math.max(0, Math.min(75, init.left + deltaXPercent));
        }
        if (isDraggingHandle === 'r') {
          nextInsets.right = Math.max(0, Math.min(75, init.right - deltaXPercent));
        }

        setCropInsets(nextInsets);
      }
    };

    const handleMouseUp = () => {
      if (isMoving) {
        setIsMoving(false);
        if (onUpdateCrop) {
          onUpdateCrop({
            position: localPos,
            scale: localScale,
            pan: localPan,
          });
        }
      }

      if (isDraggingHandle) {
        const wasCropHandle = ['t', 'b', 'l', 'r'].includes(isDraggingHandle);
        setIsDraggingHandle(null);

        if (wasCropHandle) {
          handleCommitChanges();
        } else if (onUpdateCrop) {
          onUpdateCrop({
            position: localPos,
            scale: localScale,
            pan: localPan,
          });
        }
      }
    };

    if (isMoving || isDraggingHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isMoving, isDraggingHandle, localScale, localPos, cropInsets, localPan, onUpdateCrop]);

  // Start moving the image body
  const handleStartMove = (e) => {
    if (readOnly || isLocked) return;
    // If an annotation tool is active (e.g. dimension line, box), don't hijack drag
    if (activeTool && activeTool !== 'select') return;

    e.preventDefault();
    setIsSelected(true);
    setIsMoving(true);

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      pos: { ...localPos },
      scale: localScale,
      insets: { ...cropInsets },
    };
  };

  // Start dragging a resize (corner) or crop (edge) handle
  const handleStartHandleDrag = (handleName, e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingHandle(handleName);

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      pos: { ...localPos },
      scale: localScale,
      insets: { ...cropInsets },
    };
  };

  const handleCommitChanges = async () => {
    let bakedUrl = null;
    if (
      cropInsets.top > 0 ||
      cropInsets.right > 0 ||
      cropInsets.bottom > 0 ||
      cropInsets.left > 0
    ) {
      bakedUrl = await bakeCroppedImage();
      setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 });
    }

    if (onUpdateCrop) {
      onUpdateCrop({
        croppedUrl: bakedUrl,
        position: localPos,
        scale: localScale,
        pan: localPan,
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

  const imageWidthPercent = Math.round(localScale * 100);
  const imageHeightPercent = Math.round(localScale * 100);

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
        minHeight: height ? 'auto' : '180px',
        background: '#ffffff',
        boxSizing: 'border-box',
        overflow: 'hidden',
        border: isSelected ? '1px dashed #2b579a' : '1px solid #e5e7eb',
        borderRadius: '2px',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* Photo Label Badge in Top-Left */}
      {label && (
        <div
          style={{
            position: 'absolute',
            top: '6px',
            left: '6px',
            background: 'rgba(17, 24, 39, 0.78)',
            color: '#ffffff',
            fontSize: '9px',
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: '2px',
            zIndex: 25,
            pointerEvents: 'none',
            letterSpacing: '0.03em',
          }}
        >
          {label}
        </div>
      )}

      {/* Quick Delete button in Top-Right if removable */}
      {onRemove && !readOnly && !isLocked && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            background: 'rgba(239, 68, 68, 0.9)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '2px',
            padding: '2px 6px',
            fontSize: '9px',
            cursor: 'pointer',
            zIndex: 25,
            fontWeight: 700,
          }}
          title="Delete image"
        >
          ✕ Delete
        </button>
      )}
      {/* 
        NO FLOATING POPUP BAR / WINDOWS AS STRICTLY REQUESTED BY USER.
        Interaction is 100% direct on the image:
        - Click & Drag body: MOVES image across the entire workspace area
        - Drag corner handles: RESIZES / SCALES image size proportionally
        - Drag edge handles: CROPS borders
      */}

      {/* Resizable, Croppable & Movable Image Frame */}
      <div
        onMouseDown={handleStartMove}
        style={{
          position: 'absolute',
          left: `${localPos.x}%`,
          top: `${localPos.y}%`,
          width: `${imageWidthPercent}%`,
          height: `${imageHeightPercent}%`,
          boxSizing: 'border-box',
          border: isSelected ? '2px solid #2b579a' : 'none',
          boxShadow: isSelected ? '0 0 0 1px rgba(255,255,255,0.8), 0 2px 8px rgba(0,0,0,0.15)' : 'none',
          cursor: isSelected ? (isMoving ? 'grabbing' : 'move') : 'pointer',
          transition: isMoving || isDraggingHandle ? 'none' : 'box-shadow 0.15s ease',
        }}
        title={isSelected ? 'Click and drag to move image anywhere | Drag handles to resize or crop' : 'Click to select image'}
      >
        {/* Main Image Viewport Area with Crop Clipping */}
        <div
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
                transform: zoom !== 1 ? `scale(${zoom})` : 'none',
                display: 'block',
                pointerEvents: 'none',
              }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: '11px' }}>
              No image attached
            </div>
          )}

          {/* Shaded mask over cropped areas during edge drag */}
          {(cropInsets.top > 0 || cropInsets.bottom > 0 || cropInsets.left > 0 || cropInsets.right > 0) && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.35)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        {/* Word-Style 8 Drag Handles (Visible when image is Selected) */}
        {isSelected && !readOnly && !isLocked && (
          <>
            {/* 1. Corner Handle: Top-Left (Resize) */}
            <div
              onMouseDown={(e) => handleStartHandleDrag('tl', e)}
              style={{
                position: 'absolute',
                top: '-6px',
                left: '-6px',
                width: '12px',
                height: '12px',
                background: '#ffffff',
                border: '2px solid #2b579a',
                borderRadius: '1px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                cursor: 'nwse-resize',
                zIndex: 30,
              }}
              title="Drag corner to resize image"
            />

            {/* 2. Edge Handle: Top-Center (Crop Top) */}
            <div
              onMouseDown={(e) => handleStartHandleDrag('t', e)}
              style={{
                position: 'absolute',
                top: '-4px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '24px',
                height: '6px',
                background: '#2b579a',
                borderRadius: '2px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                cursor: 'ns-resize',
                zIndex: 30,
              }}
              title="Drag to crop top edge"
            />

            {/* 3. Corner Handle: Top-Right (Resize) */}
            <div
              onMouseDown={(e) => handleStartHandleDrag('tr', e)}
              style={{
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                width: '12px',
                height: '12px',
                background: '#ffffff',
                border: '2px solid #2b579a',
                borderRadius: '1px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                cursor: 'nesw-resize',
                zIndex: 30,
              }}
              title="Drag corner to resize image"
            />

            {/* 4. Edge Handle: Right-Center (Crop Right) */}
            <div
              onMouseDown={(e) => handleStartHandleDrag('r', e)}
              style={{
                position: 'absolute',
                top: '50%',
                right: '-4px',
                transform: 'translateY(-50%)',
                width: '6px',
                height: '24px',
                background: '#2b579a',
                borderRadius: '2px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                cursor: 'ew-resize',
                zIndex: 30,
              }}
              title="Drag to crop right edge"
            />

            {/* 5. Corner Handle: Bottom-Right (Resize) */}
            <div
              onMouseDown={(e) => handleStartHandleDrag('br', e)}
              style={{
                position: 'absolute',
                bottom: '-6px',
                right: '-6px',
                width: '12px',
                height: '12px',
                background: '#ffffff',
                border: '2px solid #2b579a',
                borderRadius: '1px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                cursor: 'nwse-resize',
                zIndex: 30,
              }}
              title="Drag corner to resize image"
            />

            {/* 6. Edge Handle: Bottom-Center (Crop Bottom) */}
            <div
              onMouseDown={(e) => handleStartHandleDrag('b', e)}
              style={{
                position: 'absolute',
                bottom: '-4px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '24px',
                height: '6px',
                background: '#2b579a',
                borderRadius: '2px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                cursor: 'ns-resize',
                zIndex: 30,
              }}
              title="Drag to crop bottom edge"
            />

            {/* 7. Corner Handle: Bottom-Left (Resize) */}
            <div
              onMouseDown={(e) => handleStartHandleDrag('bl', e)}
              style={{
                position: 'absolute',
                bottom: '-6px',
                left: '-6px',
                width: '12px',
                height: '12px',
                background: '#ffffff',
                border: '2px solid #2b579a',
                borderRadius: '1px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                cursor: 'nesw-resize',
                zIndex: 30,
              }}
              title="Drag corner to resize image"
            />

            {/* 8. Edge Handle: Left-Center (Crop Left) */}
            <div
              onMouseDown={(e) => handleStartHandleDrag('l', e)}
              style={{
                position: 'absolute',
                top: '50%',
                left: '-4px',
                transform: 'translateY(-50%)',
                width: '6px',
                height: '24px',
                background: '#2b579a',
                borderRadius: '2px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                cursor: 'ew-resize',
                zIndex: 30,
              }}
              title="Drag to crop left edge"
            />
          </>
        )}
      </div>
    </div>
  );
}
