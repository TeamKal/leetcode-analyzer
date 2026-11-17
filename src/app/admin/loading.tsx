export default function AdminLoading() {
  return (
    <div className="ds min-h-screen bg-page" aria-busy="true">
      <p className="mx-auto max-w-[1120px] px-4 py-10 text-sm text-muted sm:px-6">
        Loading dashboard…
      </p>
    </div>
  );
}
