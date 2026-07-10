import { useEffect, useRef, useState } from 'react';

type SpinnerSize = 'sm' | 'md' | 'lg';

type SpinnerProps = {
  size?: SpinnerSize;
  className?: string;
};

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
};

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <span
      className={`${sizeClasses[size]} animate-spin rounded-full border-emerald-100 border-t-emerald-500 ${className}`}
      aria-label="Loading"
    />
  );
}

export function DelayedSpinnerOverlay({
  className = '',
  delayMs = 350,
  loading,
  minVisibleMs = 0,
  size = 'lg',
}: {
  className?: string;
  delayMs?: number;
  loading: boolean;
  minVisibleMs?: number;
  size?: SpinnerSize;
}) {
  const [rendered, setRendered] = useState(false);
  const [opaque, setOpaque] = useState(false);
  const visibleSinceRef = useRef<number | null>(null);

  useEffect(() => {
    let showTimer: number | undefined;
    let hideTimer: number | undefined;
    let removeTimer: number | undefined;
    let animationFrame: number | undefined;

    function hide() {
      setOpaque(false);
      removeTimer = window.setTimeout(() => {
        setRendered(false);
        visibleSinceRef.current = null;
      }, 180);
    }

    if (loading) {
      showTimer = window.setTimeout(() => {
        visibleSinceRef.current = Date.now();
        setRendered(true);
        animationFrame = window.requestAnimationFrame(() => setOpaque(true));
      }, delayMs);
    } else if (rendered) {
      const elapsedMs = visibleSinceRef.current == null ? 0 : Date.now() - visibleSinceRef.current;
      const remainingMs = Math.max(0, minVisibleMs - elapsedMs);
      hideTimer = window.setTimeout(hide, remainingMs);
    } else {
      setOpaque(false);
      visibleSinceRef.current = null;
    }

    return () => {
      if (showTimer) window.clearTimeout(showTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
      if (removeTimer) window.clearTimeout(removeTimer);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [delayMs, loading, minVisibleMs, rendered]);

  if (!rendered) return null;

  return (
    <div className={`absolute inset-0 z-30 flex items-center justify-center bg-white/65 backdrop-blur-[1px] transition-opacity duration-200 ease-out ${opaque ? 'opacity-100' : 'opacity-0'} ${className}`}>
      <Spinner size={size} />
    </div>
  );
}
