'use client';

import { useEffect, useRef } from 'react';
import { useMotionValue, useSpring, useInView } from 'framer-motion';

interface AnimatedCounterProps {
  value: number;
  formatFn: (n: number) => string;
  className?: string;
  duration?: number;
}

export default function AnimatedCounter({
  value,
  formatFn,
  className = '',
  duration = 1.5,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, {
    duration: duration * 1000,
    bounce: 0,
  });

  useEffect(() => {
    if (isInView) {
      motionValue.set(value);
    }
  }, [isInView, value, motionValue]);

  useEffect(() => {
    const unsubscribe = spring.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = formatFn(latest);
      }
    });
    return unsubscribe;
  }, [spring, formatFn]);

  return (
    <span ref={ref} className={className}>
      {formatFn(0)}
    </span>
  );
}
