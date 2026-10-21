import React, { useState, useRef, useEffect } from 'react';
import AnnotationCanvas from './AnnotationCanvas';
import { TOOLS } from './ReviewToolbar';

/**
 * UnifiedReferenceCanvas:
 * Single, unified reference image workspace for all product photos.
 * Picture 1 (Primary Drawing) and all additional photos (Picture 2, Picture 3...)
 * share the EXACT SAME canvas container with zero separate divisions.
 * 
 * Users can:
 * - Resize Picture 1 to create blank space in the canvas.
 * - Move additional photos (Picture 2, 3...) directly INTO that blank space.
 * - Freely resize, crop, and move ANY image anywhere across the canvas.
 * - NO separate divisions, NO popup windows.
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
  height = '400px',
}) {
  const canvasRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null); // 'primary' | img.id

  // Dragging / Moving / Resizing / Cropping state
  const [activeAction, setActiveAction] = useState(null); // { type: 'move'|'handle', targetId: string, handleName?: string }
  const [dragCurrent, setDragCurrent] = useState(null); // live preview coordinates during drag

  const dragStartRef = useRef({
    startX: 0,
    startY: 0,
    targetId: null,
    initPos: { x: 0, y: 0 },
    initScale: 1,
    initInsets: { top: 0, right: 0, bottom: 0, left: 0 },
  });

  const [cropInsetsMap, setCropInsetsMap] = useState({}); // { [targetId]: { top, right, bottom, left } }

  // Helpers to get current geometry for an image
  const getImageData = (id) => {
    if (id === 'primary') {
      const defaultScale = (product.additionalImages && product.additionalImages.length > 0) ? 0.6 : 1;
      return {
        id: 'primary',
        url: product.photo,
        originalUrl: product.originalPhoto,
        label: 'PICTURE - 1: QUOTATION REFERENCE & PRODUCTION DRAWING',
        scale: product.photoScale !== undefined && product.photoScale !== null ? product.photoScale : defaultScale,
        posX: product.photoPosX !== undefined && product.photoPosX !== null ? product.photoPosX : 0,
        posY: product.photoPosY !== undefined && product.photoPosY !== null ? product.photoPosY : 0,
        pan: product.photoPan || { x: 50, y: 50 },
        zoom: product.photoZoom || 1,
        isPrimary: true,
      };
    }
    const addImgs = product.additionalImages || [];
    const idx = addImgs.findIndex((img) => img.id === id);
    if (idx === -1) return null;
    const img = addImgs[idx];

    // Smart default positions in the blank space beside/below Picture 1
    const defaultX = idx === 0 ? 54 : idx === 1 ? 54 : 0;
    const defaultY = idx === 0 ? 0 : idx === 1 ? 50 : 54;
    const defaultScale = 0.44;

    return {
      id: img.id,
      url: img.url,
      originalUrl: img.originalUrl,
      label: img.label || `PICTURE - ${idx + 2}`,
      scale: img.scale !== undefined && img.scale !== null ? img.scale : defaultScale,
      posX: img.posX !== undefined && img.posX !== null ? img.posX : defaultX,
      posY: img.posY !== undefined && img.posY !== null ? img.posY : defaultY,
      pan: img.pan || { x: 50, y: 50 },
      zoom: img.zoom || 1,
      isPrimary: false,
    };
  };

  // Click outside to deselect
  useEffect(() => {
    const handleDocumentClick = (e) => {
      if (canvasRef.current && !canvasRef.current.contains(e.target)) {
        setSelectedId(null);
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, []);

  // Keyboard Nudge (Arrow Keys) for selected image
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedId || readOnly || isLocked) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const data = getImageData(selectedId);
        if (!data) return;

        const step = e.shiftKey ? 5 : 1;
        const maxPosX = Math.max(0, 100 - Math.round(data.scale * 100));
        const maxPosY = Math.max(0, 100 - Math.round(data.scale * 100));

        let nextX = data.posX;
        let nextY = data.posY;
        if (e.key === 'ArrowLeft') nextX = Math.max(0, nextX - step);
        if (e.key === 'ArrowRight') nextX = Math.min(maxPosX, nextX + step);
        if (e.key === 'ArrowUp') nextY = Math.max(0, nextY - step);
        if (e.key === 'ArrowDown') nextY = Math.min(maxPosY, nextY + step);

        const updatedPos = { x: Math.round(nextX * 10) / 10, y: Math.round(nextY * 10) / 10 };
        savePosition(selectedId, updatedPos.x, updatedPos.y);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, product, readOnly, isLocked]);

  // Mouse Move & Mouse Up for drag move, corner resize, and edge crop
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!activeAction || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const deltaXPercent = ((e.clientX - dragStartRef.current.startX) / rect.width) * 100;
      const deltaYPercent = ((e.clientY - dragStartRef.current.startY) / rect.height) * 100;

      // 1. FREE MOVE: Move image to any (x, y) on the canvas (into blank spaces)
      if (activeAction.type === 'move') {
        const initScale = dragStartRef.current.initScale;
        const maxPosX = Math.max(0, 100 - Math.round(initScale * 100));
        const maxPosY = Math.max(0, 100 - Math.round(initScale * 100));

        const nextX = Math.max(0, Math.min(maxPosX, dragStartRef.current.initPos.x + deltaXPercent));
        const nextY = Math.max(0, Math.min(maxPosY, dragStartRef.current.initPos.y + deltaYPercent));

        setDragCurrent({
          id: activeAction.targetId,
          type: 'move',
          posX: Math.round(nextX * 10) / 10,
          posY: Math.round(nextY * 10) / 10,
        });
      }

      // 2. CORNER RESIZE: Proportional scale
      else if (activeAction.type === 'handle' && ['tl', 'tr', 'br', 'bl'].includes(activeAction.handleName)) {
        const hName = activeAction.handleName;
        let scaleDelta = 0;
        if (hName === 'br') scaleDelta = ((deltaXPercent + deltaYPercent) / 2) / 80;
        else if (hName === 'tl') scaleDelta = -((deltaXPercent + deltaYPercent) / 2) / 80;
        else if (hName === 'tr') scaleDelta = ((deltaXPercent - deltaYPercent) / 2) / 80;
        else if (hName === 'bl') scaleDelta = ((-deltaXPercent + deltaYPercent) / 2) / 80;

        const nextScale = Math.max(0.18, Math.min(1.0, dragStartRef.current.initScale + scaleDelta));
        const roundedScale = Math.round(nextScale * 100) / 100;

        const maxPosX = Math.max(0, 100 - Math.round(roundedScale * 100));
        const maxPosY = Math.max(0, 100 - Math.round(roundedScale * 100));
        const nextPosX = Math.min(maxPosX, dragStartRef.current.initPos.x);
        const nextPosY = Math.min(maxPosY, dragStartRef.current.initPos.y);

        setDragCurrent({
          id: activeAction.targetId,
          type: 'resize',
          scale: roundedScale,
          posX: nextPosX,
          posY: nextPosY,
        });
      }

      // 3. EDGE CROP
      else if (activeAction.type === 'handle' && ['t', 'b', 'l', 'r'].includes(activeAction.handleName)) {
        const hName = activeAction.handleName;
        const init = dragStartRef.current.initInsets;
        let nextInsets = { ...init };

        if (hName === 't') nextInsets.top = Math.max(0, Math.min(75, init.top + deltaYPercent));
        if (hName === 'b') nextInsets.bottom = Math.max(0, Math.min(75, init.bottom - deltaYPercent));
        if (hName === 'l') nextInsets.left = Math.max(0, Math.min(75, init.left + deltaXPercent));
        if (hName === 'r') nextInsets.right = Math.max(0, Math.min(75, init.right - deltaXPercent));

        setCropInsetsMap((prev) => ({
          ...prev,
          [activeAction.targetId]: nextInsets,
        }));
      }
    };

    const handleMouseUp = async () => {
      if (!activeAction) return;

      if (activeAction.type === 'move' && dragCurrent) {
        savePosition(activeAction.targetId, dragCurrent.posX, dragCurrent.posY);
      } else if (activeAction.type === 'handle' && ['tl', 'tr', 'br', 'bl'].includes(activeAction.handleName) && dragCurrent) {
        saveScale(activeAction.targetId, dragCurrent.scale, dragCurrent.posX, dragCurrent.posY);
      } else if (activeAction.type === 'handle' && ['t', 'b', 'l', 'r'].includes(activeAction.handleName)) {
        const insets = cropInsetsMap[activeAction.targetId];
        if (insets && (insets.top > 0 || insets.right > 0 || insets.bottom > 0 || insets.left > 0)) {
          const imgData = getImageData(activeAction.targetId);
          if (imgData) {
            const baked = await bakeCroppedImage(imgData.url, insets);
            if (baked) {
              saveCroppedUrl(activeAction.targetId, baked);
            }
          }
          setCropInsetsMap((prev) => ({ ...prev, [activeAction.targetId]: { top: 0, right: 0, bottom: 0, left: 0 } }));
        }
      }

      setActiveAction(null);
      setDragCurrent(null);
    };

    if (activeAction) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeAction, dragCurrent, cropInsetsMap, product]);

  // Save actions to product state and database
  const savePosition = (id, x, y) => {
    if (id === 'primary') {
      onUpdateProduct(product.id, { photoPosX: x, photoPosY: y });
    } else {
      const updated = (product.additionalImages || []).map((img) =>
        img.id === id ? { ...img, posX: x, posY: y } : img
      );
      onUpdateProduct(product.id, { additionalImages: updated });
    }
  };

  const saveScale = (id, scale, posX, posY) => {
    if (id === 'primary') {
      onUpdateProduct(product.id, { photoScale: scale, photoPosX: posX, photoPosY: posY });
    } else {
      const updated = (product.additionalImages || []).map((img) =>
        img.id === id ? { ...img, scale, posX, posY } : img
      );
      onUpdateProduct(product.id, { additionalImages: updated });
    }
  };

  const saveCroppedUrl = (id, croppedUrl) => {
    if (id === 'primary') {
      onUpdateProduct(product.id, {
        photo: croppedUrl,
        originalPhoto: product.originalPhoto || product.photo,
      });
    } else {
      const updated = (product.additionalImages || []).map((img) =>
        img.id === id ? { ...img, url: croppedUrl, originalUrl: img.originalUrl || img.url } : img
      );
      onUpdateProduct(product.id, { additionalImages: updated });
    }
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

  // Start dragging image body
  const handleStartMove = (id, e) => {
    if (readOnly || isLocked) return;
    if (id === 'primary' && activeTool && activeTool !== TOOLS.SELECT) return;

    e.preventDefault();
    setSelectedId(id);
    const data = getImageData(id);
    if (!data) return;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      targetId: id,
      initPos: { x: data.posX, y: data.posY },
      initScale: data.scale,
      initInsets: cropInsetsMap[id] || { top: 0, right: 0, bottom: 0, left: 0 },
    };

    setActiveAction({ type: 'move', targetId: id });
  };

  // Start dragging handle (corner resize or edge crop)
  const handleStartHandle = (id, handleName, e) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(id);
    const data = getImageData(id);
    if (!data) return;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      targetId: id,
      initPos: { x: data.posX, y: data.posY },
      initScale: data.scale,
      initInsets: cropInsetsMap[id] || { top: 0, right: 0, bottom: 0, left: 0 },
    };

    setActiveAction({ type: 'handle', targetId: id, handleName });
  };

  // Render a single image frame (Picture 1 or Additional View)
  const renderImageFrame = (id) => {
    const data = getImageData(id);
    if (!data) return null;

    const isSel = selectedId === id;
    const isThisDragging = activeAction?.targetId === id;

    // Use live preview position/scale if currently dragging
    const currScale = (isThisDragging && dragCurrent?.scale !== undefined) ? dragCurrent.scale : data.scale;
    const currPosX = (isThisDragging && dragCurrent?.posX !== undefined) ? dragCurrent.posX : data.posX;
    const currPosY = (isThisDragging && dragCurrent?.posY !== undefined) ? dragCurrent.posY : data.posY;

    const widthPercent = Math.round(currScale * 100);
    const heightPercent = Math.round(currScale * 100);

    const insets = cropInsetsMap[id] || { top: 0, right: 0, bottom: 0, left: 0 };
    const hasCrop = insets.top > 0 || insets.right > 0 || insets.bottom > 0 || insets.left > 0;

    return (
      <div
        key={id}
        onMouseDown={(e) => handleStartMove(id, e)}
        style={{
          position: 'absolute',
          left: `${currPosX}%`,
          top: `${currPosY}%`,
          width: `${widthPercent}%`,
          height: `${heightPercent}%`,
          boxSizing: 'border-box',
          border: isSel ? '2px solid #2b579a' : '1px solid #d1d5db',
          boxShadow: isSel ? '0 0 0 1px #ffffff, 0 4px 14px rgba(0,0,0,0.22)' : '0 1px 4px rgba(0,0,0,0.08)',
          borderRadius: '2px',
          background: '#fafafa',
          zIndex: isSel ? 30 : id === 'primary' ? 10 : 15,
          cursor: isSel ? (activeAction?.type === 'move' ? 'grabbing' : 'move') : 'pointer',
          transition: isThisDragging ? 'none' : 'box-shadow 0.15s ease',
        }}
        title={isSel ? 'Click & drag anywhere to move | Drag corners to resize | Drag edges to crop' : `Click to select ${data.label}`}
      >
        {/* Label Badge in Top-Left */}
        <div
          style={{
            position: 'absolute',
            top: '6px',
            left: '6px',
            background: 'rgba(17, 24, 39, 0.85)',
            color: '#ffffff',
            fontSize: '9px',
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: '2px',
            zIndex: 35,
            pointerEvents: 'none',
            letterSpacing: '0.03em',
          }}
        >
          {data.label}
        </div>

        {/* Quick Delete button for Additional Images */}
        {!data.isPrimary && onRemoveAdditionalImage && !readOnly && !isLocked && (
          <button
            type="button"
            className="no-print"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveAdditionalImage(product.id, id);
            }}
            style={{
              position: 'absolute',
              top: '6px',
              right: '6px',
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px',
              padding: '2px 6px',
              fontSize: '9px',
              cursor: 'pointer',
              zIndex: 35,
              fontWeight: 700,
            }}
            title="Remove this photo from canvas"
          >
            ✕ Delete
          </button>
        )}

        {/* Viewport with Crop Inset */}
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
            clipPath: hasCrop
              ? `inset(${insets.top}% ${insets.right}% ${insets.bottom}% ${insets.left}%)`
              : 'none',
          }}
        >
          {data.isPrimary ? (
            <AnnotationCanvas
              imageSrc={data.url}
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
              panX={data.pan?.x ?? 50}
              panY={data.pan?.y ?? 50}
              zoom={data.zoom ?? 1}
            />
          ) : data.url ? (
            <img
              src={data.url}
              alt={data.label}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: `${data.pan?.x ?? 50}% ${data.pan?.y ?? 50}%`,
                transform: data.zoom !== 1 ? `scale(${data.zoom})` : 'none',
                display: 'block',
                pointerEvents: 'none',
              }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: '11px' }}>
              No image
            </div>
          )}

          {/* Shaded mask over cropped borders during drag */}
          {hasCrop && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.4)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>

        {/* 8 Drag Handles (Visible when this image is selected) */}
        {isSel && !readOnly && !isLocked && (
          <>
            {/* 1. Corner Handle: Top-Left (Resize) */}
            <div
              onMouseDown={(e) => handleStartHandle(id, 'tl', e)}
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
                zIndex: 40,
              }}
              title="Drag corner to resize image"
            />

            {/* 2. Edge Handle: Top-Center (Crop) */}
            <div
              onMouseDown={(e) => handleStartHandle(id, 't', e)}
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
                zIndex: 40,
              }}
              title="Drag to crop top edge"
            />

            {/* 3. Corner Handle: Top-Right (Resize) */}
            <div
              onMouseDown={(e) => handleStartHandle(id, 'tr', e)}
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
                zIndex: 40,
              }}
              title="Drag corner to resize image"
            />

            {/* 4. Edge Handle: Right-Center (Crop) */}
            <div
              onMouseDown={(e) => handleStartHandle(id, 'r', e)}
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
                zIndex: 40,
              }}
              title="Drag to crop right edge"
            />

            {/* 5. Corner Handle: Bottom-Right (Resize) */}
            <div
              onMouseDown={(e) => handleStartHandle(id, 'br', e)}
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
                zIndex: 40,
              }}
              title="Drag corner to resize image"
            />

            {/* 6. Edge Handle: Bottom-Center (Crop) */}
            <div
              onMouseDown={(e) => handleStartHandle(id, 'b', e)}
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
                zIndex: 40,
              }}
              title="Drag to crop bottom edge"
            />

            {/* 7. Corner Handle: Bottom-Left (Resize) */}
            <div
              onMouseDown={(e) => handleStartHandle(id, 'bl', e)}
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
                zIndex: 40,
              }}
              title="Drag corner to resize image"
            />

            {/* 8. Edge Handle: Left-Center (Crop) */}
            <div
              onMouseDown={(e) => handleStartHandle(id, 'l', e)}
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
                zIndex: 40,
              }}
              title="Drag to crop left edge"
            />
          </>
        )}
      </div>
    );
  };

  const additionalImgs = product.additionalImages || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {/* 
        THE SINGLE UNIFIED REFERENCE CANVAS:
        Picture 1 and all additional images share this EXACT SAME container.
        Zero separate divisions.
        Images can be moved into any blank space across this entire area.
      */}
      <div
        ref={canvasRef}
        onClick={() => {
          if (!activeAction) setSelectedId(null);
        }}
        style={{
          position: 'relative',
          width: '100%',
          height: height || '380px',
          background: '#ffffff',
          border: '1.5px solid #d1d5db',
          borderRadius: '2px',
          overflow: 'hidden',
          userSelect: 'none',
          boxSizing: 'border-box',
        }}
      >
        {/* Render Picture 1 (Primary Drawing) */}
        {renderImageFrame('primary')}

        {/* Render All Additional Images in the same canvas */}
        {additionalImgs.map((img) => renderImageFrame(img.id))}
      </div>

      {/* Upload Control: Directly underneath the unified canvas */}
      {!readOnly && (
        <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '10px' }}>
          <label
            style={{
              fontSize: '11px',
              color: '#2b579a',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#f0f7ff',
              border: '1px solid #bfdbfe',
              padding: '4px 10px',
              borderRadius: '2px',
            }}
          >
            <span>+ Upload Photo to Canvas (Picture - {additionalImgs.length + 2})</span>
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => onAddAdditionalImage && onAddAdditionalImage(product.id, e)}
            />
          </label>
          <span style={{ fontSize: '10px', color: '#777' }}>
            All photos share this canvas. Resize or drag any photo into the blank space.
          </span>
        </div>
      )}
    </div>
  );
}
