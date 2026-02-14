'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface AnimatedProgressBarProps {
  percent: number;
  color?: string;
  className?: string;
}

export default function AnimatedProgressBar({
  percent,
  color,
  className = '',
}: AnimatedProgressBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-30px' });

  return (
    <div ref={ref} className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${className}`}
        style={color ? { backgroundColor: color } : undefined}
        initial={{ width: 0 }}
        animate={isInView ? { width: `${percent}%` } : { width: 0 }}
        transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
      />
    </div>
  );
}
