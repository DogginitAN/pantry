"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    navigator.serviceWorker?.register("/sw.js").catch(console.error);
  }, []);

  return null;
}
