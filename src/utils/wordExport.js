import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageOrientation,
  ImageRun,
  Packer,
  AlignmentType,
  ShadingType,
} from 'docx';
import { TOOLS } from '../components/ReviewToolbar';

/**
 * Convert base64 data URL to Uint8Array for docx ImageRun
 */
function base64ToUint8Array(dataUrl) {
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Draw arrowheads on canvas
 */
function drawCanvasArrow(ctx, fromX, fromY, toX, toY, color = '#e74c3c', size = 10) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - size * Math.cos(angle - Math.PI / 6),
    toY - size * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - size * Math.cos(angle + Math.PI / 6),
    toY - size * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draw single annotation onto 2D canvas context
 */
function drawAnnotationOnCanvas(ctx, ann, W, H) {
  const x1 = (ann.x1 / 100) * W;
  const y1 = (ann.y1 / 100) * H;
  const x2 = ann.x2 !== undefined ? (ann.x2 / 100) * W : x1;
  const y2 = ann.y2 !== undefined ? (ann.y2 / 100) * H : y1;
  const color = ann.color || '#e74c3c';
  const strokeW = (ann.strokeWidth || 2) * 1.5;

  ctx.save();

  switch (ann.type) {
    case TOOLS.DIMENSION: {
      // Main Dimension Line
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // End Arrowheads
      drawCanvasArrow(ctx, x1, y1, x2, y2, color, 12);
      drawCanvasArrow(ctx, x2, y2, x1, y1, color, 12);

      // Boundary Dots
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.arc(x2, y2, 4, 0, Math.PI * 2);
      ctx.fill();

      // White Rectangular Label Box with Red Border
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const text = ann.text || '120 cm';
      ctx.font = 'bold 13px Inter, Arial, sans-serif';
      const textMetrics = ctx.measureText(text);
      const boxW = Math.max(76, textMetrics.width + 18);
      const boxH = 26;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.strokeRect(midX - boxW / 2, midY - boxH / 2, boxW, boxH);

      // Label Text
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, midX, midY);
      break;
    }

    case TOOLS.BOX: {
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      ctx.strokeStyle = color;
      ctx.lineWidth = strokeW;
      ctx.strokeRect(minX, minY, width, height);

      // Corner handles
      ctx.fillStyle = color;
      ctx.fillRect(minX - 3, minY - 3, 6, 6);
      ctx.fillRect(minX + width - 3, minY - 3, 6, 6);
      ctx.fillRect(minX - 3, minY + height - 3, 6, 6);
      ctx.fillRect(minX + width - 3, minY + height - 3, 6, 6);
      break;
    }

    case TOOLS.LEADER: {
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      drawCanvasArrow(ctx, x1, y1, x2, y2, color, 10);

      // End text label
      if (ann.text) {
        ctx.font = '600 12px Inter, Arial, sans-serif';
        const txtW = ctx.measureText(ann.text).width + 12;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x2 + 4, y2 - 12, txtW, 22);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x2 + 4, y2 - 12, txtW, 22);
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(ann.text, x2 + 10, y2 - 1);
      }
      break;
    }

    case TOOLS.TERMINATOR: {
      // Anchor dot at (x1, y1)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x1, y1, 5, 0, Math.PI * 2);
      ctx.fill();

      // Connecting line to (x2, y2)
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      // Horizontal shelf line
      const shelfX = x2 > x1 ? x2 + 50 : x2 - 50;
      ctx.lineTo(shelfX, y2);
      ctx.stroke();

      if (ann.text) {
        ctx.font = '600 12px Inter, Arial, sans-serif';
        ctx.fillStyle = '#111111';
        ctx.textAlign = x2 > x1 ? 'left' : 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(ann.text, x2 + (x2 > x1 ? 4 : -4), y2 - 3);
      }
      break;
    }

    case TOOLS.CALLOUT: {
      // Speech Bubble
      const bubbleW = 120;
      const bubbleH = 46;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.rect(x2, y2, bubbleW, bubbleH);
      ctx.fill();
      ctx.stroke();

      // Tail connecting to (x1, y1)
      ctx.beginPath();
      ctx.moveTo(x2, y2 + bubbleH / 2);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = 'italic 11px Inter, Arial, sans-serif';
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(ann.text || 'Callout detail', x2 + 8, y2 + bubbleH / 2);
      break;
    }

    case TOOLS.HIGHLIGHT: {
      if (ann.points && ann.points.length > 1) {
        ctx.strokeStyle = ann.color || 'rgba(255, 235, 59, 0.45)';
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ann.points.forEach((pt, idx) => {
          const px = (pt.x / 100) * W;
          const py = (pt.y / 100) * H;
          if (idx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
      break;
    }

    case TOOLS.CIRCLE: {
      const minX = Math.min(x1, x2);
      const minY = Math.min(y1, y2);
      const radX = Math.abs(x2 - x1) / 2;
      const radY = Math.abs(y2 - y1) / 2;
      const centerX = minX + radX;
      const centerY = minY + radY;

      ctx.strokeStyle = color;
      ctx.lineWidth = strokeW;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, Math.max(radX, 8), Math.max(radY, 8), 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case TOOLS.TEXT: {
      ctx.font = 'bold 12px Inter, Arial, sans-serif';
      const txt = ann.text || 'Instruction note';
      const metrics = ctx.measureText(txt);
      const w = metrics.width + 16;
      const h = 26;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x1, y1, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x1, y1, w, h);

      ctx.fillStyle = '#111111';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, x1 + 8, y1 + h / 2);
      break;
    }

    case TOOLS.MAGNIFIER: {
      const radius = (ann.radius || 12) * (W / 100);
      // Source circular outline
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x1, y1, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Connecting arrow to target inset
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      drawCanvasArrow(ctx, x1, y1, x2, y2, color, 8);

      // Target circular inset
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x2, y2, radius * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#111111';
      ctx.font = 'bold 11px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('2X DETAIL', x2, y2);
      break;
    }

    case TOOLS.STAMP: {
      // Official Green Approval Seal
      const stampW = 160;
      const stampH = 55;
      ctx.fillStyle = 'rgba(232, 245, 233, 0.9)';
      ctx.fillRect(x1, y1, stampW, stampH);

      ctx.strokeStyle = '#27ae60';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, stampW, stampH);
      ctx.lineWidth = 1;
      ctx.strokeRect(x1 + 3, y1 + 3, stampW - 6, stampH - 6);

      ctx.fillStyle = '#1b5e20';
      ctx.font = 'bold 11px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('APPROVED FOR PRODUCTION', x1 + stampW / 2, y1 + 16);

      ctx.fillStyle = '#2e7d32';
      ctx.font = '9px Inter, Arial, sans-serif';
      ctx.fillText(ann.dateStr || new Date().toLocaleDateString('en-IN'), x1 + stampW / 2, y1 + 30);
      ctx.fillText(ann.signatory || 'Production Manager', x1 + stampW / 2, y1 + 44);
      break;
    }

    default:
      break;
  }

  ctx.restore();
}

/**
 * Render product image + annotations to a PNG Data URL
 */
export async function renderProductCanvasToImage(product, targetWidth = 1000, targetHeight = 650) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    // Solid white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);

    const finishAnnotations = () => {
      const annotations = product.annotations || [];
      annotations.forEach((ann) => {
        drawAnnotationOnCanvas(ctx, ann, targetWidth, targetHeight);
      });
      resolve(canvas.toDataURL('image/png'));
    };

    if (product.photo) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Aspect-fit image onto canvas
        const imgAspect = img.width / img.height;
        const canvasAspect = targetWidth / targetHeight;
        let drawW = targetWidth;
        let drawH = targetHeight;
        let offsetX = 0;
        let offsetY = 0;

        if (imgAspect > canvasAspect) {
          drawW = targetWidth;
          drawH = targetWidth / imgAspect;
          offsetY = (targetHeight - drawH) / 2;
        } else {
          drawH = targetHeight;
          drawW = targetHeight * imgAspect;
          offsetX = (targetWidth - drawW) / 2;
        }

        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
        finishAnnotations();
      };
      img.onerror = () => {
        // Fallback placeholder box
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.strokeStyle = '#cccccc';
        ctx.strokeRect(10, 10, targetWidth - 20, targetHeight - 20);
        ctx.fillStyle = '#777777';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Reference Image Preview', targetWidth / 2, targetHeight / 2);
        finishAnnotations();
      };
      img.src = product.photo;
    } else {
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.strokeStyle = '#cccccc';
      ctx.strokeRect(10, 10, targetWidth - 20, targetHeight - 20);
      ctx.fillStyle = '#777777';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No Reference Image Attached', targetWidth / 2, targetHeight / 2);
      finishAnnotations();
    }
  });
}

/**
 * Build Word Table for Selected Fabric Details (Exact 7-column Reference Image 1 Layout)
 */
function buildFabricDetailsWordTable(fabricSelections = []) {
  const borderGrey = { style: BorderStyle.SINGLE, size: 4, color: '111111' };
  const cellBorders = {
    top: borderGrey,
    bottom: borderGrey,
    left: borderGrey,
    right: borderGrey,
  };

  // Header row - 7 Columns matching Reference Image 1
  const headerCols = [
    { text: 'Sl. No.', width: 8 },
    { text: 'Part Name', width: 18 },
    { text: 'Specification', width: 20 },
    { text: 'Code', width: 12 },
    { text: 'Reference Image', width: 18 },
    { text: 'Qty', width: 10 },
    { text: 'Remark', width: 14 },
  ];

  const headerRow = new TableRow({
    tableHeader: true,
    children: headerCols.map((col) =>
      new TableCell({
        width: { size: col.width, type: WidthType.PERCENTAGE },
        shading: { fill: 'F3F4F6', type: ShadingType.CLEAR },
        borders: cellBorders,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: col.text,
                bold: true,
                size: 17, // 8.5pt
                color: '111111',
              }),
            ],
          }),
        ],
      })
    ),
  });

  const bodyRows = [];
  if (!fabricSelections || fabricSelections.length === 0) {
    bodyRows.push(
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 7,
            borders: cellBorders,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'No fabric specifications added yet. (Editable in Microsoft Word)',
                    italics: true,
                    size: 16,
                    color: '666666',
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  } else {
    fabricSelections.forEach((fab, idx) => {
      // Swatch cell handling
      let swatchParagraph;
      try {
        if (fab.refImage && fab.refImage.startsWith('data:image')) {
          swatchParagraph = new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: base64ToUint8Array(fab.refImage),
                transformation: { width: 44, height: 28 },
              }),
            ],
          });
        } else {
          swatchParagraph = new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: '—',
                size: 17,
                color: '888888',
              }),
            ],
          });
        }
      } catch (err) {
        swatchParagraph = new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '—', size: 17, color: '888888' })],
        });
      }

      bodyRows.push(
        new TableRow({
          children: [
            // 1. Sl. No.
            new TableCell({
              borders: cellBorders,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(idx + 1), size: 17, bold: true })] })],
            }),
            // 2. Part Name
            new TableCell({
              borders: cellBorders,
              children: [new Paragraph({ children: [new TextRun({ text: fab.partName || fab.location || '—', size: 17 })] })],
            }),
            // 3. Specification
            new TableCell({
              borders: cellBorders,
              children: [new Paragraph({ children: [new TextRun({ text: fab.specification || fab.brand || '—', size: 17 })] })],
            }),
            // 4. Code
            new TableCell({
              borders: cellBorders,
              children: [new Paragraph({ children: [new TextRun({ text: fab.code || fab.catalogueCode || '—', size: 17 })] })],
            }),
            // 5. Reference Image
            new TableCell({
              borders: cellBorders,
              children: [swatchParagraph],
            }),
            // 6. Qty
            new TableCell({
              borders: cellBorders,
              children: [new Paragraph({ children: [new TextRun({ text: fab.qty || fab.totalMeter || fab.yardage || '—', size: 17 })] })],
            }),
            // 7. Remark
            new TableCell({
              borders: cellBorders,
              children: [new Paragraph({ children: [new TextRun({ text: fab.remark || '—', size: 17 })] })],
            }),
          ],
        })
      );
    });
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

/**
 * Generate a complete, editable Microsoft Word (.docx) document
 * for either a single product preview or all products.
 */
export async function buildReviewWordDoc({ doc, targetProduct = null, orientation = 'landscape' }) {
  const isPortrait = orientation === 'portrait';
  const productsToExport = targetProduct ? [targetProduct] : doc.products || [];

  const pageWidth = isPortrait ? 11906 : 16838; // A4 DXA
  const pageHeight = isPortrait ? 16838 : 11906;

  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const borderNoneObj = {
    top: noBorder,
    bottom: noBorder,
    left: noBorder,
    right: noBorder,
    insideHorizontal: noBorder,
    insideVertical: noBorder,
  };

  const sections = [];

  for (let i = 0; i < productsToExport.length; i++) {
    const product = productsToExport[i];
    const pIdx = doc.products.findIndex((p) => p.id === product.id);
    const itemNum = (pIdx >= 0 ? pIdx : i) + 1;
    const isApproved = product.approvalStatus === 'Approved';
    const pid = product.productId || (isApproved ? `PID-${doc.series}-${String(itemNum).padStart(2, '0')}` : 'PENDING');

    // 1. Render annotated preview image for this product
    const canvasPngDataUrl = await renderProductCanvasToImage(product, 1100, 720);
    const canvasBytes = base64ToUint8Array(canvasPngDataUrl);

    // 2. Build 2-column Word table for Landscape (or stacked for Portrait)
    const leftChildren = [
      new Paragraph({
        children: [
          new TextRun({
            text: 'PICTURE - 1: QUOTATION REFERENCE & PRODUCTION DRAWING',
            bold: true,
            size: 17,
            color: '444444',
          }),
        ],
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [
          new ImageRun({
            data: canvasBytes,
            transformation: {
              width: isPortrait ? 520 : 440,
              height: isPortrait ? 330 : 285,
            },
          }),
        ],
        spacing: { after: 140 },
      }),
    ];

    // If product has additional views, include them
    if (product.additionalImages && product.additionalImages.length > 0) {
      leftChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `ADDITIONAL VIEWS (${product.additionalImages.length} attached photos):`,
              bold: true,
              size: 15,
              color: '666666',
            }),
          ],
          spacing: { after: 80 },
        })
      );
      product.additionalImages.slice(0, 3).forEach((addImg) => {
        try {
          if (addImg.url && addImg.url.startsWith('data:image')) {
            leftChildren.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    data: base64ToUint8Array(addImg.url),
                    transformation: { width: 90, height: 90 },
                  }),
                  new TextRun({
                    text: `  ${addImg.label || 'Picture'}: ${addImg.caption || 'Detail'}`,
                    size: 14,
                    color: '555555',
                  }),
                ],
                spacing: { after: 60 },
              })
            );
          }
        } catch (e) {
          console.warn('Failed embedding additional image in Word doc:', e);
        }
      });
    }

    // Add Fabric Details Table to left column
    leftChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'SELECTED FABRIC DETAILS',
            bold: true,
            size: 18,
            color: '111111',
          }),
        ],
        spacing: { before: 100, after: 80 },
      }),
      buildFabricDetailsWordTable(product.fabricSelections),
      new Paragraph({ text: '', spacing: { after: 120 } })
    );

    // Add Technical Specifications (Client Input & ZOOSH Proposed Spec) to left column
    const blueBorder = { style: BorderStyle.SINGLE, size: 6, color: '2B579A' };
    const greenBorder = { style: BorderStyle.SINGLE, size: 6, color: '27AE60' };

    leftChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: borderNoneObj,
        rows: [
          new TableRow({
            children: [
              // Client Input Box (Blue)
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: { top: blueBorder, bottom: blueBorder, left: blueBorder, right: blueBorder },
                shading: { fill: 'F4F7FB', type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'CLIENT INPUT (SITE MEASUREMENTS)',
                        bold: true,
                        size: 16,
                        color: '2B579A',
                      }),
                    ],
                    spacing: { after: 60 },
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Dining counter height: ', size: 15, color: '444444' }),
                      new TextRun({ text: product.clientInputs?.counterHeight || '______ cm', bold: true, size: 15, color: '111111' }),
                    ],
                    spacing: { after: 40 },
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Available clearance: ', size: 15, color: '444444' }),
                      new TextRun({ text: product.clientInputs?.clearance || '______ cm', bold: true, size: 15, color: '111111' }),
                    ],
                    spacing: { after: 40 },
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Required site measurement: ', size: 15, color: '444444' }),
                      new TextRun({ text: product.clientInputs?.siteMeasurement || '______ cm', bold: true, size: 15, color: '111111' }),
                    ],
                  }),
                ],
              }),
              // Proposed Spec Box (Green)
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: { top: greenBorder, bottom: greenBorder, left: greenBorder, right: greenBorder },
                shading: { fill: 'F5FAF6', type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'ZOOSH PROPOSED SPECIFICATION',
                        bold: true,
                        size: 16,
                        color: '27AE60',
                      }),
                    ],
                    spacing: { after: 60 },
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Proposed overall height: ', size: 15, color: '444444' }),
                      new TextRun({ text: '75 cm', bold: true, size: 15, color: '111111' }),
                    ],
                    spacing: { after: 40 },
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Proposed seat height: ', size: 15, color: '444444' }),
                      new TextRun({ text: '65 cm', bold: true, size: 15, color: '111111' }),
                    ],
                    spacing: { after: 40 },
                  }),
                  new Paragraph({
                    children: [
                      new TextRun({ text: 'Internal frame: ', size: 15, color: '444444' }),
                      new TextRun({ text: 'Treated Solid Teak Wood', bold: true, size: 15, color: '111111' }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      new Paragraph({ text: '', spacing: { after: 120 } })
    );

    // Add Customer Note Area to left column
    leftChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'CUSTOMER NOTE',
            bold: true,
            size: 18,
            color: '111111',
          }),
        ],
        spacing: { after: 40 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Designated editable note area for customer feedback & finish requirements:',
            size: 15,
            color: '666666',
          }),
        ],
        spacing: { after: 60 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 6, color: '111111' },
                  bottom: { style: BorderStyle.SINGLE, size: 6, color: '111111' },
                  left: { style: BorderStyle.SINGLE, size: 6, color: '111111' },
                  right: { style: BorderStyle.SINGLE, size: 6, color: '111111' },
                },
                shading: { fill: 'FAFAFA', type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text:
                          product.customerNotes ||
                          'Click here to type customer feedback, specific upholstery instructions, or finish requirements in Microsoft Word...',
                        italics: !product.customerNotes,
                        size: 18,
                        color: product.customerNotes ? '111111' : '777777',
                      }),
                    ],
                    spacing: { before: 100, after: 100 },
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );

    // Build Right Column: Dedicated CLIENT REMARKS Column (Reference Image 2)
    const rightRemarksChildren = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'CLIENT REMARKS',
            bold: true,
            underline: {},
            size: 20,
            color: '111111',
          }),
        ],
        spacing: { after: 40 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `Revision : ${product.remarksRevision || '01'}`,
            bold: true,
            underline: {},
            size: 17,
            color: '111111',
          }),
        ],
        spacing: { after: 120 },
      }),
    ];

    if (product.clientRemarks && product.clientRemarks.length > 0) {
      product.clientRemarks.forEach((rem, rIdx) => {
        rightRemarksChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${rIdx + 1}.  ${rem}`,
                size: 17,
                color: '111111',
              }),
            ],
            spacing: { after: 80 },
          })
        );
      });
    } else {
      // 4 placeholder lines for client handwriting or typing in Word
      for (let ln = 1; ln <= 4; ln++) {
        rightRemarksChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${ln}.  ____________________________________`,
                size: 17,
                color: '888888',
              }),
            ],
            spacing: { after: 100 },
          })
        );
      }
    }

    // Main 2-column table layout with vertical divider
    const contentTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: borderNoneObj,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: isPortrait ? 100 : 70, type: WidthType.PERCENTAGE },
              borders: borderNoneObj,
              children: leftChildren,
            }),
            new TableCell({
              width: { size: isPortrait ? 100 : 30, type: WidthType.PERCENTAGE },
              borders: {
                ...borderNoneObj,
                left: { style: BorderStyle.SINGLE, size: 8, color: '111111' },
              },
              children: rightRemarksChildren,
            }),
          ],
        }),
      ],
    });

    // Top Product Information Box (Exact Reference Image 2 Layout)
    const infoBorder = { style: BorderStyle.SINGLE, size: 6, color: '111111' };
    const topInfoTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: infoBorder,
        bottom: infoBorder,
        left: infoBorder,
        right: infoBorder,
        insideHorizontal: infoBorder,
        insideVertical: infoBorder,
      },
      rows: [
        new TableRow({
          children: [
            // Col 1: Sl. No. & ITEM
            new TableCell({
              width: { size: 38, type: WidthType.PERCENTAGE },
              borders: { top: infoBorder, bottom: infoBorder, left: infoBorder, right: infoBorder },
              shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Sl. No. : ', bold: true, size: 18 }),
                    new TextRun({ text: `${itemNum}`, size: 18 }),
                  ],
                  spacing: { after: 30 },
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: 'ITEM : ', bold: true, size: 18 }),
                    new TextRun({ text: `${product.name.toUpperCase()}`, bold: true, size: 18 }),
                  ],
                }),
              ],
            }),
            // Col 2: PRODUCT ID & QUANTITY
            new TableCell({
              width: { size: 34, type: WidthType.PERCENTAGE },
              borders: { top: infoBorder, bottom: infoBorder, left: infoBorder, right: infoBorder },
              shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'PRODUCT ID : ', bold: true, size: 18 }),
                    new TextRun({
                      text: pid,
                      bold: true,
                      size: 18,
                      color: isApproved ? '27AE60' : 'D97706',
                    }),
                  ],
                  spacing: { after: 30 },
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: 'QUANTITY : ', bold: true, size: 18 }),
                    new TextRun({ text: `${product.qty} ${product.utype || 'nos'}`, size: 18 }),
                  ],
                }),
              ],
            }),
            // Col 3: Revision & Last Edited
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              borders: { top: infoBorder, bottom: infoBorder, left: infoBorder, right: infoBorder },
              shading: { fill: 'FFFFFF', type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Revision : ', bold: true, size: 18 }),
                    new TextRun({ text: `${doc.sheetNoFormatted || '01'}`, bold: true, size: 18 }),
                  ],
                  spacing: { after: 30 },
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Last Edited : ', bold: true, size: 18 }),
                    new TextRun({ text: `${new Date().toLocaleDateString('en-IN')}`, size: 18 }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

    // Page Children
    const pageChildren = [
      // Running Document Header
      new Paragraph({
        children: [
          new TextRun({
            text: 'ZOOSH CUSTOM FURNITURE • PRODUCT REVIEW SHEET',
            bold: true,
            size: 16,
            color: '666666',
          }),
          new TextRun({
            text: `\tQTN-${doc.series} / SHEET NO.: ${doc.sheetNoFormatted || '01'}`,
            bold: true,
            size: 16,
            color: '666666',
          }),
        ],
        spacing: { after: 120 },
      }),

      // Top Product Information Box (Exact Reference Image 2 Layout)
      topInfoTable,

      new Paragraph({
        text: '',
        spacing: { after: 140 },
      }),

      // 2-Column Product Content (Left Image/Fabric/Specs & Right Client Remarks)
      contentTable,

      // Footer Signatures & Approval Line
      new Paragraph({
        text: '',
        spacing: { after: 160 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: borderNoneObj,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: borderNoneObj,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: 'Client Signatory: __________________________   Date: ____________',
                        size: 16,
                        color: '444444',
                      }),
                    ],
                  }),
                ],
              }),
              new TableCell({
                borders: borderNoneObj,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({
                        text: `Production Manager Approval: ${isApproved ? 'Approved (PID Generated)' : 'Pending'}   Date: ${
                          product.approvedAt ? new Date(product.approvedAt).toLocaleDateString('en-IN') : '____________'
                        }`,
                        size: 16,
                        color: '444444',
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ];

    sections.push({
      properties: {
        page: {
          pageOrientation: isPortrait ? PageOrientation.PORTRAIT : PageOrientation.LANDSCAPE,
          size: {
            width: pageWidth,
            height: pageHeight,
          },
          margin: {
            top: 720,
            right: 720,
            bottom: 720,
            left: 720,
          },
        },
      },
      children: pageChildren,
    });
  }

  return new Document({ sections });
}

/**
 * Trigger immediate browser download of the generated Word document blob
 */
function downloadWordBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

/**
 * Export a single product preview to an editable Word document (.docx)
 */
export async function exportSingleProductWord(doc, product, productIndex = 0, orientation = 'landscape') {
  const wordDoc = await buildReviewWordDoc({
    doc,
    targetProduct: product,
    orientation,
  });
  const blob = await Packer.toBlob(wordDoc);
  const safeName = (product.name || 'Product').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `ZOOSH-Review-Sheet-${doc.series}-Item-${productIndex + 1}-${safeName}.docx`;
  downloadWordBlob(blob, filename);
}

/**
 * Export all product previews to an editable Microsoft Word document (.docx)
 */
export async function exportFullReviewWord(doc, orientation = 'landscape') {
  const wordDoc = await buildReviewWordDoc({
    doc,
    targetProduct: null,
    orientation,
  });
  const blob = await Packer.toBlob(wordDoc);
  const filename = `ZOOSH-Review-Sheet-${doc.series}-Complete.docx`;
  downloadWordBlob(blob, filename);
}
