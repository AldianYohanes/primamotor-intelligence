export default function AdminLoading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900"
        role="status"
        aria-label="Memuat"
      />
    </div>
  );
}
