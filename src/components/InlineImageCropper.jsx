import React, { useEffect, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

/**
 * InlineImageCropper: WordPress-style in-screen image cropping and repositioning.
 * Renders directly inside the product image card without any obscuring popups/modals.
 */
export default function InlineImageCropper({
  imageSrc,
  onApply,
  onCancel,
  onReset,
  hasOriginal = false,
}) {
  const imgRef = useRef(null);
  const cropperRef = useRef(null);
  const [activeRatio, setActiveRatio] = useState('free');

  useEffect(() => {
    if (imgRef.current) {
      cropperRef.current = new Cropper(imgRef.current, {
        viewMode: 1,
        autoCropArea: 0.98,
        background: false,
        responsive: true,
        movable: true,
        zoomable: true,
        rotatable: true,
        scalable: true,
        cropBoxMovable: true,
        cropBoxResizable: true,
      });
    }

    return () => {
      if (cropperRef.current) {
        cropperRef.current.destroy();
        cropperRef.current = null;
      }
    };
  }, [imageSrc]);

  const handleRatioChange = (ratio, name) => {
    setActiveRatio(name);
    if (cropperRef.current) {
      cropperRef.current.setAspectRatio(ratio);
    }
  };

  const handleZoom = (amount) => {
    if (cropperRef.current) {
      cropperRef.current.zoom(amount);
    }
  };

  const handleRotate = (deg) => {
    if (cropperRef.current) {
      cropperRef.current.rotate(deg);
    }
  };

  const handleApply = () => {
    if (cropperRef.current) {
      // Export high-resolution crop without hardcoded tiny 400x300 limits
      const canvas = cropperRef.current.getCroppedCanvas({
        maxWidth: 1600,
        maxHeight: 1600,
        imageSmoothingQuality: 'high',
      });
      if (canvas) {
        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        onApply(croppedDataUrl);
      }
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        background: '#1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '2px',
        overflow: 'hidden',
      }}
    >
      {/* WordPress-style Inline Floating Control Bar */}
      <div
        className="no-print"
        style={{
          background: 'rgba(24, 24, 27, 0.95)',
          backdropFilter: 'blur(4px)',
          color: '#ffffff',
          padding: '6px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          borderBottom: '1px solid #333333',
          zIndex: 60,
        }}
      >
        {/* Left: Aspect Ratio Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '10px', color: '#aaaaaa', fontWeight: 600, marginRight: '4px' }}>
            Ratio:
          </span>
          <button
            type="button"
            onClick={() => handleRatioChange(NaN, 'free')}
            style={{
              padding: '2px 7px',
              fontSize: '10px',
              fontWeight: activeRatio === 'free' ? 700 : 400,
              background: activeRatio === 'free' ? '#2b579a' : '#333333',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            Free
          </button>
          <button
            type="button"
            onClick={() => handleRatioChange(4 / 3, '4:3')}
            style={{
              padding: '2px 7px',
              fontSize: '10px',
              fontWeight: activeRatio === '4:3' ? 700 : 400,
              background: activeRatio === '4:3' ? '#2b579a' : '#333333',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            4:3
          </button>
          <button
            type="button"
            onClick={() => handleRatioChange(16 / 9, '16:9')}
            style={{
              padding: '2px 7px',
              fontSize: '10px',
              fontWeight: activeRatio === '16:9' ? 700 : 400,
              background: activeRatio === '16:9' ? '#2b579a' : '#333333',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            16:9
          </button>
          <button
            type="button"
            onClick={() => handleRatioChange(1, '1:1')}
            style={{
              padding: '2px 7px',
              fontSize: '10px',
              fontWeight: activeRatio === '1:1' ? 700 : 400,
              background: activeRatio === '1:1' ? '#2b579a' : '#333333',
              color: '#ffffff',
              border: 'none',
              borderRadius: '2px',
              cursor: 'pointer',
            }}
          >
            1:1
          </button>
        </div>

        {/* Center: Zoom & Rotate Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            type="button"
            onClick={() => handleZoom(0.1)}
            style={{
              background: '#333333',
              color: '#ffffff',
              border: 'none',
              padding: '2px 6px',
              fontSize: '10px',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
            title="Zoom In"
          >
            🔍+
          </button>
          <button
            type="button"
            onClick={() => handleZoom(-0.1)}
            style={{
              background: '#333333',
              color: '#ffffff',
              border: 'none',
              padding: '2px 6px',
              fontSize: '10px',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
            title="Zoom Out"
          >
            🔍-
          </button>
          <button
            type="button"
            onClick={() => handleRotate(-90)}
            style={{
              background: '#333333',
              color: '#ffffff',
              border: 'none',
              padding: '2px 6px',
              fontSize: '10px',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
            title="Rotate Left"
          >
            ⟲
          </button>
          <button
            type="button"
            onClick={() => handleRotate(90)}
            style={{
              background: '#333333',
              color: '#ffffff',
              border: 'none',
              padding: '2px 6px',
              fontSize: '10px',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
            title="Rotate Right"
          >
            ⟳
          </button>
        </div>

        {/* Right: Commit & Cancel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {hasOriginal && onReset && (
            <button
              type="button"
              onClick={onReset}
              style={{
                background: '#444444',
                color: '#ffffff',
                border: 'none',
                padding: '3px 8px',
                fontSize: '10px',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
              title="Reset to original uncropped image"
            >
              ↺ Reset Original
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: '#444444',
              color: '#ffffff',
              border: 'none',
              padding: '3px 8px',
              fontSize: '10px',
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            ✕ Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            style={{
              background: '#27ae60',
              color: '#ffffff',
              border: 'none',
              padding: '3px 12px',
              fontSize: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              borderRadius: '2px',
            }}
          >
            ✓ Apply Crop
          </button>
        </div>
      </div>

      {/* In-Screen Cropping Canvas Container */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#111111',
        }}
      >
        <img
          ref={imgRef}
          src={imageSrc}
          alt="Cropping target"
          style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }}
        />
      </div>
    </div>
  );
}
