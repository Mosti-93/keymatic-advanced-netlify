"use client";
import { useEffect, useRef } from "react";

/**
 * Runs an async loader once, after the first render.
 * Keeps data-loading out of the render path and lint-clean
 * (react-hooks/set-state-in-effect).
 */
export function useLoadOnMount(load) {
  const loadRef = useRef(load);
  useEffect(() => {
    (async () => {
      await loadRef.current();
    })();
  }, []);
}
