"use client";

import { useEffect } from "react";

export function OfflineActions() {
  // Kembali ke halaman semula otomatis begitu sinyal pulih.
  useEffect(() => {
    const reload = () => window.location.reload();
    window.addEventListener("online", reload);
    return () => window.removeEventListener("online", reload);
  }, []);

  return (
    <div className="flex justify-center gap-2 pt-1">
      <button onClick={() => window.location.reload()} className="btn btn-primary">
        Coba lagi
      </button>
      <a href="/chat" className="btn btn-secondary no-underline">
        Buka chat
      </a>
    </div>
  );
}
