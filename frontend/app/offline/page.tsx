import ReloadButton from "@/components/ui/ReloadButton";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center text-warm-900">
      <h1 className="font-heading text-3xl text-warm-900 mb-4">You&apos;re offline</h1>
      <p className="text-warm-500 mb-8 text-center max-w-sm">
        Check your internet connection and try again.
      </p>
      <ReloadButton />
    </div>
  );
}
