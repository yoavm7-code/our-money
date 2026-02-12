'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/context';

interface AvatarCropperProps {
  file: File;
  onCrop: (blob: Blob) => void;
  onCancel: () => void;
  outputSize?: number;
}

export default function AvatarCropper({ file, onCrop, onCancel, outputSize = 256 }: AvatarCropperProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  const canvasSize = 280;

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
      // Compute initial zoom to fit image in circle
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      const initialZoom = canvasSize / minDim;
      setZoom(initialZoom);
      // Center the image
      setOffset({
        x: (canvasSize - img.naturalWidth * initialZoom) / 2,
        y: (canvasSize - img.naturalHeight * initialZoom) / 2,
      });
    };
    img.src = URL.createObjectURL(file);
    return () => URL.revokeObjectURL(img.src);
  }, [file]);

  // Render canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvasSize;
    canvas.height = canvasSize;

    // Clear
    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // Draw image
    ctx.save();
    // Clip to circle
    ctx.beginPath();
    ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      img,
      offset.x,
      offset.y,
      img.naturalWidth * zoom,
      img.naturalHeight * zoom
    );
    ctx.restore();

    // Draw overlay outside circle
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvasSize, canvasSize);
    // Cut out circle
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Circle border
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }, [offset, zoom]);

  useEffect(() => {
    if (imageLoaded) {
      requestAnimationFrame(draw);
    }
  }, [imageLoaded, draw]);

  // Pointer events for dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handlePointerUp = () => {
    setDragging(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    setZoom((z) => Math.max(0.1, Math.min(5, z + delta)));
  };

  // Crop and export
  function handleCrop() {
    const img = imageRef.current;
    if (!img) return;

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = outputSize;
    outputCanvas.height = outputSize;
    const ctx = outputCanvas.getContext('2d');
    if (!ctx) return;

    // Scale from display size to output size
    const scale = outputSize / canvasSize;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      img,
      offset.x * scale,
      offset.y * scale,
      img.naturalWidth * zoom * scale,
      img.naturalHeight * zoom * scale
    );

    outputCanvas.toBlob(
      (blob) => {
        if (blob) onCrop(blob);
      },
      'image/png',
      1
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-[var(--card)] rounded-2xl shadow-2xl border border-[var(--border)] p-6 max-w-sm w-full animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-bold text-lg mb-4 text-center">{t('profile.cropAvatar')}</h3>

        <div className="flex justify-center mb-4">
          <canvas
            ref={canvasRef}
            width={canvasSize}
            height={canvasSize}
            className="cursor-grab active:cursor-grabbing rounded-full"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            style={{ touchAction: 'none', width: canvasSize, height: canvasSize }}
          />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 mb-6">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 shrink-0">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <input
            type="range"
            min="0.1"
            max="5"
            step="0.01"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500"
          />
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-400 shrink-0">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </div>

        <p className="text-xs text-slate-400 text-center mb-4">{t('profile.cropHint')}</p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleCrop}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
