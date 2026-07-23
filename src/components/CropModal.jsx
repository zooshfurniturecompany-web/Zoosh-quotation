import React, { useEffect, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';

export default function CropModal({ imageSrc, onApply, onClose }) {
  const imgRef = useRef(null);
  const cropperRef = useRef(null);
  const [activeRatio, setActiveRatio] = useState('4:3');

  useEffect(() => {
    if (imgRef.current) {
      cropperRef.current = new Cropper(imgRef.current, {
        aspectRatio: 4 / 3,
        viewMode: 1,
        autoCropArea: 1.0,
        background: false,
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

  const handleApply = () => {
    if (cropperRef.current) {
      const canvas = cropperRef.current.getCroppedCanvas({
        width: 800,
        height: 600,
      });
      if (canvas) {
        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
        onApply(croppedDataUrl);
      }
    }
  };

  return (
    <div className="crop-modal-wrap" style={{ display: 'flex' }}>
      <div className="crop-modal-content">
        <div className="crop-modal-header">
          <h3>Crop Reference Image</h3>
          <button className="crop-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="crop-modal-body">
          <div className="crop-image-container">
            <img ref={imgRef} src={imageSrc} alt="Image to crop" style={{ maxWidth: '100%', display: 'block' }} />
          </div>
        </div>
        <div className="crop-modal-footer">
          <div className="crop-aspect-ratios" style={{ display: 'flex', gap: '6px', marginRight: 'auto' }}>
            <button
              className={`crop-btn secondary ratio-btn ${activeRatio === '4:3' ? 'active' : ''}`}
              onClick={() => handleRatioChange(4 / 3, '4:3')}
            >
              4:3
            </button>
            <button
              className={`crop-btn secondary ratio-btn ${activeRatio === '1:1' ? 'active' : ''}`}
              onClick={() => handleRatioChange(1, '1:1')}
            >
              1:1
            </button>
            <button
              className={`crop-btn secondary ratio-btn ${activeRatio === '3:4' ? 'active' : ''}`}
              onClick={() => handleRatioChange(3 / 4, '3:4')}
            >
              3:4
            </button>
            <button
              className={`crop-btn secondary ratio-btn ${activeRatio === 'free' ? 'active' : ''}`}
              onClick={() => handleRatioChange(NaN, 'free')}
            >
              Free
            </button>
          </div>
          <button className="crop-btn secondary" onClick={onClose}>Cancel</button>
          <button className="crop-btn primary" onClick={handleApply}>Apply Crop</button>
        </div>
      </div>
    </div>
  );
}
