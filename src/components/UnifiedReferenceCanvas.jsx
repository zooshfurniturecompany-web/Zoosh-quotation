import React, { useState, useRef, useEffect } from 'react';
import AnnotationCanvas from './AnnotationCanvas';
import { TOOLS } from './ReviewToolbar';

/**
 * UnifiedReferenceCanvas:
 * Single, unified reference image workspace for all product photos.
 * 
 * KEY FEATURES:
 * 1. AUTOMATIC CANVAS FILL:
 *    - All images automatically fit and fill 100% of the canvas with ZERO blank spaces.
 *    - 1 Image: Picture 1 fills 100% of the canvas.
 *    - 2 Images: Picture 1 (62% left) + Picture 2 (38% right) fill 100% width & height.
 *    - 3 Images: Picture 1 (60% left) + Picture 2 & 3 stacked on the right fill 100%.
 *    - 4 Images: Picture 1 (55% left) + Picture 2, 3, 4 grid on the right fill 100%.
 * 
 * 2. NO ACCIDENTAL CROP ON CLICK:
 *    - Normal clicks ONLY select the image or draw annotations.
 *    - Crop handles only appear when the user intentionally clicks "✂️ Crop" on that image.
 *    - Dragging inside an image pans/repositions the focal point (objectPosition) without moving the frame.
 * 
 * 3. ADJUSTABLE SPLIT:
 *    - Users can drag the vertical divider or use quick presets (60/40, 50/50, 70/30)
 *      to give more or less space to Picture 1 while keeping everything 100% filled.
 */
export default function UnifiedReferenceCanvas({
  product,
  activeTool = TOOLS.SELECT,
  activeColor = '#e74c3c',
  activeStroke = 2,
  isApproved = false,
  onApproveProduct,
  isLocked = false,
  readOnly = false,
  onUpdateProduct,
  onAddAdditionalImage,
  onRemoveAdditionalImage,
  height = '390px',
}) {
  const canvasRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null); // 'primary' | img.id
  const [croppingId, setCroppingId] = useState(null); // ID of image currently in intentional crop mode

  // Canvas split percentage for Picture 1 vs Additional Views (default 60%)
  const splitPercent = product.canvasSplit !== undefined && product.canvasSplit !== null ? product.canvasSplit : 60;
  const [localSplit, setLocalSplit] = useState(splitPercent);
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);

  // In-image panning state (dragging inside photo adjusts focal point objectPosition)
  const [panningTarget, setPanningTarget] = useState(null);
  const panStartRef = useRef({ startX: 0, startY: 0, initPan: { x: 50, y: 50 } });

  // Crop handles state
  const [cropInsets, setCropInsets] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [isDraggingCropHandle, setIsDraggingCropHandle] = useState(null);
  const cropStartRef = useRef({ startX: 0, startY: 0, initInsets: { top: 0, right: 0, bottom: 0, left: 0 } });

  useEffect(() => {
    if (product.canvasSplit !== undefined && product.canvasSplit !== null) {
      setLocalSplit(product.canvasSplit);
    }
  }, [product.canvasSplit]);

  // Click outside to deselect
  useEffect(() => {
    const handleDocumentClick = (e) => {
      if (canvasRef.current && !canvasRef.current.contains(e.target)) {
        setSelectedId(null);
        if (croppingId) {
          setCroppingId(null);
          setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 });
        }
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, [croppingId]);

  // Mouse Move & Mouse Up for Divider Dragging, In-Image Panning, and Intentional Cropping
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();

      // 1. DRAG DIVIDER (Adjust split ratio between Picture 1 and Additional Views)
      if (isDraggingDivider) {
        const newSplit = Math.max(35, Math.min(80, ((e.clientX - rect.left) / rect.width) * 100));
        setLocalSplit(Math.round(newSplit));
      }

      // 2. PAN IMAGE FOCAL POINT (Only if mouse actually moved > 4px)
      else if (panningTarget) {
        const deltaX = e.clientX - panStartRef.current.startX;
        const deltaY = e.clientY - panStartRef.current.startY;
        if (Math.hypot(deltaX, deltaY) > 4) {
          const deltaXPercent = (deltaX / rect.width) * 100;
          const deltaYPercent = (deltaY / rect.height) * 100;

          const nextX = Math.max(0, Math.min(100, panStartRef.current.initPan.x - deltaXPercent));
          const nextY = Math.max(0, Math.min(100, panStartRef.current.initPan.y - deltaYPercent));

          if (panningTarget === 'primary') {
            onUpdateProduct(product.id, { photoPan: { x: Math.round(nextX), y: Math.round(nextY) } }, true);
          } else {
            const updated = (product.additionalImages || []).map((img) =>
              img.id === panningTarget ? { ...img, pan: { x: Math.round(nextX), y: Math.round(nextY) } } : img
            );
            onUpdateProduct(product.id, { additionalImages: updated }, true);
          }
        }
      }

      // 3. INTENTIONAL CROP HANDLE DRAG
      else if (isDraggingCropHandle) {
        const deltaX = ((e.clientX - cropStartRef.current.startX) / rect.width) * 100;
        const deltaY = ((e.clientY - cropStartRef.current.startY) / rect.height) * 100;
        const init = cropStartRef.current.initInsets;
        let next = { ...init };

        if (isDraggingCropHandle === 't') next.top = Math.max(0, Math.min(75, init.top + deltaY));
        if (isDraggingCropHandle === 'b') next.bottom = Math.max(0, Math.min(75, init.bottom - deltaY));
        if (isDraggingCropHandle === 'l') next.left = Math.max(0, Math.min(75, init.left + deltaX));
        if (isDraggingCropHandle === 'r') next.right = Math.max(0, Math.min(75, init.right - deltaX));

        setCropInsets(next);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingDivider) {
        setIsDraggingDivider(false);
        onUpdateProduct(product.id, { canvasSplit: localSplit });
      }
      if (panningTarget) {
        setPanningTarget(null);
      }
      if (isDraggingCropHandle) {
        setIsDraggingCropHandle(null);
      }
    };

    if (isDraggingDivider || panningTarget || isDraggingCropHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingDivider, panningTarget, isDraggingCropHandle, localSplit, product]);

  // Handle intentional crop commit
  const handleCommitCrop = async (targetId) => {
    let imgSrc = null;
    if (targetId === 'primary') {
      imgSrc = product.photo;
    } else {
      const img = (product.additionalImages || []).find((i) => i.id === targetId);
      imgSrc = img?.url;
    }

    if (imgSrc && (cropInsets.top > 0 || cropInsets.right > 0 || cropInsets.bottom > 0 || cropInsets.left > 0)) {
      const baked = await bakeCroppedImage(imgSrc, cropInsets);
      if (baked) {
        if (targetId === 'primary') {
          onUpdateProduct(product.id, {
            photo: baked,
            originalPhoto: product.originalPhoto || product.photo,
          });
        } else {
          const updated = (product.additionalImages || []).map((img) =>
            img.id === targetId ? { ...img, url: baked, originalUrl: img.originalUrl || img.url } : img
          );
          onUpdateProduct(product.id, { additionalImages: updated });
        }
      }
    }

    setCroppingId(null);
    setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 });
  };

  const bakeCroppedImage = (imgSrc, insets) => {
    return new Promise((resolve) => {
      if (!imgSrc) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;

        const cropX = (insets.left / 100) * natW;
        const cropY = (insets.top / 100) * natH;
        const cropW = Math.max(10, natW - cropX - (insets.right / 100) * natW);
        const cropH = Math.max(10, natH - cropY - (insets.bottom / 100) * natH);

        const canvas = document.createElement('canvas');
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(null);
      img.src = imgSrc;
    });
  };

  // Start panning image content (only if in select mode, no accidental jumps)
  const handleStartPan = (targetId, currentPan, e) => {
    if (readOnly || isLocked) return;
    if (targetId === 'primary' && activeTool !== TOOLS.SELECT) return;

    setSelectedId(targetId);
    panStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initPan: { x: currentPan?.x ?? 50, y: currentPan?.y ?? 50 },
    };
    setPanningTarget(targetId);
  };

  const additionalImgs = product.additionalImages || [];
  const hasAdditional = additionalImgs.length > 0;
  const primaryWidth = hasAdditional ? `${localSplit}%` : '100%';
  const additionalWidth = hasAdditional ? `${100 - localSplit}%` : '0%';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {/* 
        ========================================================================
        THE SINGLE AUTO-FILLED CANVAS (Zero blank spaces, 100% filled)
        ========================================================================
      */}
      <div
        ref={canvasRef}
        style={{
          position: 'relative',
          width: '100%',
          height: height || '390px',
          background: '#ffffff',
          border: '1.5px solid #111111',
          borderRadius: '2px',
          overflow: 'hidden',
          display: 'flex',
          boxSizing: 'border-box',
          userSelect: 'none',
        }}
      >
        {/* ====================================================================
            CELL 1: Primary Reference Drawing (Occupies Left Side or Full Canvas)
        ==================================================================== */}
        <div
          onClick={() => setSelectedId('primary')}
          onMouseDown={(e) => handleStartPan('primary', product.photoPan, e)}
          style={{
            position: 'relative',
            width: primaryWidth,
            height: '100%',
            overflow: 'hidden',
            boxSizing: 'border-box',
            borderRight: hasAdditional ? '2px solid #111111' : 'none',
            background: '#ffffff',
            cursor: activeTool === TOOLS.SELECT ? (panningTarget === 'primary' ? 'grabbing' : 'grab') : 'crosshair',
          }}
        >
          {/* Label Badge */}
          <div
            style={{
              position: 'absolute',
              top: '8px',
              left: '8px',
              background: 'rgba(17, 24, 39, 0.85)',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '2px',
              zIndex: 25,
              pointerEvents: 'none',
              letterSpacing: '0.04em',
            }}
          >
            PICTURE - 1: QUOTATION REFERENCE & PRODUCTION DRAWING
          </div>

          {/* Action Toolbar on Hover/Select (Intentional Crop & Reset) */}
          {selectedId === 'primary' && !readOnly && !isLocked && (
            <div
              className="no-print"
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                display: 'flex',
                gap: '4px',
                zIndex: 30,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {croppingId !== 'primary' ? (
                <button
                  type="button"
                  onClick={() => {
                    setCroppingId('primary');
                    setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 });
                  }}
                  style={{
                    background: '#2b579a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '2px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Crop borders intentionally"
                >
                  ✂️ Crop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCommitCrop('primary')}
                  style={{
                    background: '#16a34a',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '2px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ✓ Apply Crop
                </button>
              )}
            </div>
          )}

          {/* Interactive Annotation Canvas Overlay */}
          <div
            style={{
              width: '100%',
              height: '100%',
              clipPath:
                croppingId === 'primary' && (cropInsets.top > 0 || cropInsets.right > 0 || cropInsets.bottom > 0 || cropInsets.left > 0)
                  ? `inset(${cropInsets.top}% ${cropInsets.right}% ${cropInsets.bottom}% ${cropInsets.left}%)`
                  : 'none',
            }}
          >
            <AnnotationCanvas
              imageSrc={product.photo}
              annotations={product.annotations || []}
              onChangeAnnotations={(newAnns) => onUpdateProduct(product.id, { annotations: newAnns })}
              activeTool={activeTool}
              activeColor={activeColor}
              activeStroke={activeStroke}
              isLocked={product.imageLocked || isLocked}
              isReadOnly={readOnly}
              onApproveProduct={() => {
                if (!isApproved && onApproveProduct) onApproveProduct();
              }}
              fit="cover"
              panX={product.photoPan?.x ?? 50}
              panY={product.photoPan?.y ?? 50}
              zoom={product.photoZoom ?? 1}
            />
          </div>

          {/* Intentional Crop Handles (Only visible when "✂️ Crop" is clicked) */}
          {croppingId === 'primary' && !readOnly && !isLocked && (
            <>
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsDraggingCropHandle('t');
                  cropStartRef.current = { startX: e.clientX, startY: e.clientY, initInsets: { ...cropInsets } };
                }}
                style={{
                  position: 'absolute',
                  top: '0px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '32px',
                  height: '8px',
                  background: '#2b579a',
                  cursor: 'ns-resize',
                  zIndex: 35,
                }}
                title="Drag to crop top edge"
              />
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsDraggingCropHandle('b');
                  cropStartRef.current = { startX: e.clientX, startY: e.clientY, initInsets: { ...cropInsets } };
                }}
                style={{
                  position: 'absolute',
                  bottom: '0px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '32px',
                  height: '8px',
                  background: '#2b579a',
                  cursor: 'ns-resize',
                  zIndex: 35,
                }}
                title="Drag to crop bottom edge"
              />
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsDraggingCropHandle('l');
                  cropStartRef.current = { startX: e.clientX, startY: e.clientY, initInsets: { ...cropInsets } };
                }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '0px',
                  transform: 'translateY(-50%)',
                  width: '8px',
                  height: '32px',
                  background: '#2b579a',
                  cursor: 'ew-resize',
                  zIndex: 35,
                }}
                title="Drag to crop left edge"
              />
              <div
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsDraggingCropHandle('r');
                  cropStartRef.current = { startX: e.clientX, startY: e.clientY, initInsets: { ...cropInsets } };
                }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: '0px',
                  transform: 'translateY(-50%)',
                  width: '8px',
                  height: '32px',
                  background: '#2b579a',
                  cursor: 'ew-resize',
                  zIndex: 35,
                }}
                title="Drag to crop right edge"
              />
            </>
          )}
        </div>

        {/* ====================================================================
            DRAGGABLE SPLIT DIVIDER (Adjust Left vs Right space while filling 100%)
        ==================================================================== */}
        {hasAdditional && !readOnly && !isLocked && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDraggingDivider(true);
            }}
            style={{
              position: 'absolute',
              left: `calc(${localSplit}% - 4px)`,
              top: 0,
              bottom: 0,
              width: '8px',
              cursor: 'col-resize',
              zIndex: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Drag divider left or right to adjust size split"
          >
            <div
              style={{
                width: '4px',
                height: '32px',
                background: isDraggingDivider ? '#2b579a' : '#888888',
                borderRadius: '2px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }}
            />
          </div>
        )}

        {/* ====================================================================
            CELL 2: Additional Images (Fills the entire remaining right side)
        ==================================================================== */}
        {hasAdditional && (
          <div
            style={{
              position: 'relative',
              width: additionalWidth,
              height: '100%',
              display: 'grid',
              gridTemplateRows: additionalImgs.length === 1 ? '1fr' : additionalImgs.length === 2 ? 'repeat(2, 1fr)' : additionalImgs.length === 3 ? '1fr 1fr' : 'repeat(2, 1fr)',
              gridTemplateColumns: additionalImgs.length >= 3 ? 'repeat(2, 1fr)' : '1fr',
              background: '#ffffff',
              boxSizing: 'border-box',
              overflow: 'hidden',
            }}
          >
            {additionalImgs.slice(0, 4).map((img, idx) => {
              const isSel = selectedId === img.id;
              const isCrop = croppingId === img.id;
              const pan = img.pan || { x: 50, y: 50 };

              return (
                <div
                  key={img.id}
                  onClick={() => setSelectedId(img.id)}
                  onMouseDown={(e) => handleStartPan(img.id, pan, e)}
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    borderBottom: idx < additionalImgs.length - 1 ? '1px solid #e5e7eb' : 'none',
                    borderRight: (additionalImgs.length >= 3 && idx % 2 === 0) ? '1px solid #e5e7eb' : 'none',
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    cursor: panningTarget === img.id ? 'grabbing' : 'grab',
                  }}
                >
                  {/* Photo Label Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '6px',
                      left: '6px',
                      background: 'rgba(17, 24, 39, 0.85)',
                      color: '#ffffff',
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '2px',
                      zIndex: 20,
                      pointerEvents: 'none',
                    }}
                  >
                    {img.label || `PICTURE - ${idx + 2}`}
                  </div>

                  {/* Actions (Crop & Delete) */}
                  {!readOnly && !isLocked && (
                    <div
                      className="no-print"
                      style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        display: 'flex',
                        gap: '3px',
                        zIndex: 25,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isCrop ? (
                        <button
                          type="button"
                          onClick={() => handleCommitCrop(img.id)}
                          style={{
                            background: '#16a34a',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '2px',
                            padding: '1px 6px',
                            fontSize: '9px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          ✓ Apply
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setCroppingId(img.id);
                            setCropInsets({ top: 0, right: 0, bottom: 0, left: 0 });
                          }}
                          style={{
                            background: '#2b579a',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '2px',
                            padding: '1px 6px',
                            fontSize: '9px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                          title="Crop image borders"
                        >
                          ✂️ Crop
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onRemoveAdditionalImage && onRemoveAdditionalImage(product.id, img.id)}
                        style={{
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '2px',
                          padding: '1px 5px',
                          fontSize: '9px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        title="Delete view"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {/* Image Element Filling 100% of cell */}
                  <img
                    src={img.url}
                    alt={img.label || `Picture - ${idx + 2}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: `${pan.x}% ${pan.y}%`,
                      display: 'block',
                      pointerEvents: 'none',
                      clipPath:
                        isCrop && (cropInsets.top > 0 || cropInsets.right > 0 || cropInsets.bottom > 0 || cropInsets.left > 0)
                          ? `inset(${cropInsets.top}% ${cropInsets.right}% ${cropInsets.bottom}% ${cropInsets.left}%)`
                          : 'none',
                    }}
                  />

                  {/* Crop Handles for Additional Image */}
                  {isCrop && (
                    <>
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsDraggingCropHandle('t');
                          cropStartRef.current = { startX: e.clientX, startY: e.clientY, initInsets: { ...cropInsets } };
                        }}
                        style={{
                          position: 'absolute',
                          top: '0px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '28px',
                          height: '6px',
                          background: '#2b579a',
                          cursor: 'ns-resize',
                          zIndex: 30,
                        }}
                      />
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsDraggingCropHandle('b');
                          cropStartRef.current = { startX: e.clientX, startY: e.clientY, initInsets: { ...cropInsets } };
                        }}
                        style={{
                          position: 'absolute',
                          bottom: '0px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: '28px',
                          height: '6px',
                          background: '#2b579a',
                          cursor: 'ns-resize',
                          zIndex: 30,
                        }}
                      />
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsDraggingCropHandle('l');
                          cropStartRef.current = { startX: e.clientX, startY: e.clientY, initInsets: { ...cropInsets } };
                        }}
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '0px',
                          transform: 'translateY(-50%)',
                          width: '6px',
                          height: '28px',
                          background: '#2b579a',
                          cursor: 'ew-resize',
                          zIndex: 30,
                        }}
                      />
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsDraggingCropHandle('r');
                          cropStartRef.current = { startX: e.clientX, startY: e.clientY, initInsets: { ...cropInsets } };
                        }}
                        style={{
                          position: 'absolute',
                          top: '50%',
                          right: '0px',
                          transform: 'translateY(-50%)',
                          width: '6px',
                          height: '28px',
                          background: '#2b579a',
                          cursor: 'ew-resize',
                          zIndex: 30,
                        }}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 
        ========================================================================
        BOTTOM CONTROLS: Upload photo to canvas & quick split presets
        ========================================================================
      */}
      {!readOnly && (
        <div
          className="no-print"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            marginTop: '2px',
          }}
        >
          {/* Upload Button */}
          <label
            style={{
              color: '#2b579a',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#f0f7ff',
              border: '1px solid #bfdbfe',
              padding: '3px 9px',
              borderRadius: '2px',
            }}
          >
            <span>+ Add Photo to Canvas (Picture - {additionalImgs.length + 2})</span>
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => onAddAdditionalImage && onAddAdditionalImage(product.id, e)}
            />
          </label>

          {/* Quick Layout Presets when multiple images exist */}
          {hasAdditional && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#666', fontSize: '10px' }}>Split:</span>
              {[
                { label: '50 / 50', val: 50 },
                { label: '60 / 40', val: 60 },
                { label: '70 / 30', val: 70 },
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => {
                    setLocalSplit(p.val);
                    onUpdateProduct(product.id, { canvasSplit: p.val });
                  }}
                  style={{
                    background: localSplit === p.val ? '#2b579a' : '#f3f4f6',
                    color: localSplit === p.val ? '#ffffff' : '#333333',
                    border: '1px solid #d1d5db',
                    borderRadius: '2px',
                    padding: '2px 6px',
                    fontSize: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
              <span style={{ color: '#888', fontSize: '10px', marginLeft: '6px' }}>
                (or drag the middle divider)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
