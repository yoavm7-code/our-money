'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/context';

interface AvatarCropperProps {
  file: File;
  onCrop: (blob: Blob) => void;
  onCancel: () => void;
}

const OUTPUT_SIZE = 256;

export default function AvatarCropper({ file, onCrop, onCancel }: AvatarCropperProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const [loaded, setLoaded] = useState(false);

  // Base scale: fit the shorter dimension to the circle
  const [baseScale, setBaseScale] = useState(1);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  const CIRCLE_SIZE = 240;

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
      // Scale so shorter side fills circle
      const scale = CIRCLE_SIZE / Math.min(img.naturalWidth, img.naturalHeight);
      setBaseScale(scale);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setLoaded(true);
    };
    img.src = URL.createObjectURL(file);
    return () => URL.revokeObjectURL(img.src);
  }, [file]);

  // Draw preview
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !loaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = CIRCLE_SIZE;
    canvas.height = CIRCLE_SIZE;

    ctx.clearRect(0, 0, CIRCLE_SIZE, CIRCLE_SIZE);

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(CIRCLE_SIZE / 2, CIRCLE_SIZE / 2, CIRCLE_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    const scale = baseScale * zoom;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    const dx = (CIRCLE_SIZE - drawW) / 2 + offset.x;
    const dy = (CIRCLE_SIZE - drawH) / 2 + offset.y;

    ctx.drawImage(img, dx, dy, drawW, drawH);
    ctx.restore();

    // Draw circle border overlay
    ctx.beginPath();
    ctx.arc(CIRCLE_SIZE / 2, CIRCLE_SIZE / 2, CIRCLE_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [loaded, zoom, offset, baseScale]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse drag handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setOffset({ x: dragStart.current.ox + dx, y: dragStart.current.oy + dy });
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.5, Math.min(4, z - e.deltaY * 0.002)));
  };

  // Export cropped image
  const handleCrop = () => {
    const img = imgRef.current;
    if (!img) return;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = OUTPUT_SIZE;
    outCanvas.height = OUTPUT_SIZE;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return;

    // Circle clip
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    const scale = baseScale * zoom;
    const ratio = OUTPUT_SIZE / CIRCLE_SIZE;
    const drawW = img.naturalWidth * scale * ratio;
    const drawH = img.naturalHeight * scale * ratio;
    const dx = (OUTPUT_SIZE - drawW) / 2 + offset.x * ratio;
    const dy = (OUTPUT_SIZE - drawH) / 2 + offset.y * ratio;

    ctx.drawImage(img, dx, dy, drawW, drawH);

    outCanvas.toBlob(
      (blob) => {
        if (blob) onCrop(blob);
      },
      'image/png',
      1,
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4" onClick={onCancel}>
      <div
        className="bg-[var(--card)] rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-lg mb-4">{t('profile.cropAvatar')}</h3>

        <div className="flex flex-col items-center gap-4">
          {/* Preview area */}
          <div
            ref={containerRef}
            className="relative rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800"
            style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE, cursor: dragging ? 'grabbing' : 'grab' }}
            onWheel={handleWheel}
          >
            <canvas
              ref={canvasRef}
              width={CIRCLE_SIZE}
              height={CIRCLE_SIZE}
              className="w-full h-full"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ touchAction: 'none' }}
            />
          </div>

          <p className="text-xs text-slate-500">{t('profile.cropHint')}</p>

          {/* Zoom slider */}
          <div className="flex items-center gap-3 w-full max-w-[240px]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 shrink-0">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            <input
              type="range"
              min="0.5"
              max="4"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary-500"
            />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 shrink-0">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
          </div>

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={handleCrop}
            >
              {t('profile.cropConfirm')}
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={onCancel}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
