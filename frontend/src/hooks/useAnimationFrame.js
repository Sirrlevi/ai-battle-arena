import { useEffect, useRef } from "react";

/**
 * Runs `callback(dt)` every animation frame while `running` is true. `dt` is
 * in seconds and clamped to 50ms so a backgrounded tab or a slow frame
 * doesn't cause a huge simulation jump when it resumes.
 */
export function useAnimationFrame(callback, running = true) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const lastRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!running) return undefined;

    function loop(timestamp) {
      if (lastRef.current == null) lastRef.current = timestamp;
      const dt = Math.min(0.05, (timestamp - lastRef.current) / 1000);
      lastRef.current = timestamp;
      callbackRef.current(dt);
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
    };
  }, [running]);
}
