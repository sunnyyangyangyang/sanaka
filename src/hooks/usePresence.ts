import { useEffect, useState } from 'react';

export function usePresence(open: boolean, durationMs = 220) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    let frame = 0;
    let nextFrame = 0;
    let timeout = 0;

    if (open) {
      setVisible(false);
      setMounted(true);
      frame = window.requestAnimationFrame(() => {
        nextFrame = window.requestAnimationFrame(() => {
          setVisible(true);
        });
      });
    } else {
      setVisible(false);
      timeout = window.setTimeout(() => {
        setMounted(false);
      }, durationMs);
    }

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      if (nextFrame) {
        window.cancelAnimationFrame(nextFrame);
      }
      if (timeout) {
        window.clearTimeout(timeout);
      }
    };
  }, [open, durationMs]);

  return { mounted, visible };
}
