import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

/**
 * Cursor component that displays a custom cursor dot
 * that follows the mouse movements for visual feedback on browser tests.
 */

const VIRTUAL_CURSOR_ID = '__mouse_dot__';

export function hideCursor() {
  document.getElementById(VIRTUAL_CURSOR_ID)?.classList.add('hidden');
}

export function showCursor() {
  document.getElementById(VIRTUAL_CURSOR_ID)?.classList.remove('hidden');
}

export default function Cursor() {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot = dotRef.current;
    if (!dot) return;

    const clickClassNames = ['scale-400'];

    const handleMouseMove = (e: MouseEvent) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
    };

    const handleMouseDown = () => {
      dot.classList.add(...clickClassNames);
    };

    const handleMouseUp = () => {
      setTimeout(() => {
        dot.classList.remove(...clickClassNames);
      }, 100);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div
      ref={dotRef}
      id={VIRTUAL_CURSOR_ID}
      className={cn(
        `pointer-events-none fixed top-0 left-0 z-[9999999] size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-3 border-gray-200 bg-blue-950 opacity-40 transition-[top,left,scale] duration-50 ease-linear`,
      )}
    />
  );
}
