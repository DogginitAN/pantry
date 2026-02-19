import ReloadButton from "@/components/ui/ReloadButton";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-100">
      <h1 className="text-3xl font-bold mb-4">You&apos;re offline</h1>
      <p className="text-zinc-400 mb-8 text-center max-w-sm">
        Check your internet connection and try again.
      </p>
      <ReloadButton />
    </div>
  );
}
