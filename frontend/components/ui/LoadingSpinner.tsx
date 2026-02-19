export default function LoadingSpinner({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <div className="w-6 h-6 border-2 border-sage-200 border-t-sage-500 rounded-full animate-spin" />
      {message && <p className="text-warm-500 text-sm">{message}</p>}
    </div>
  );
}
