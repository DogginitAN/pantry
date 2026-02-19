export default function ErrorState({
  message,
  retry,
}: {
  message?: string;
  retry?: () => void;
}) {
  return (
    <div className="bg-[#FDEAE5] border border-[#E8C4BB] text-status-out rounded-xl px-4 py-3 text-sm">
      <p>{message ?? "Something went wrong."}</p>
      {retry && (
        <button
          onClick={retry}
          className="mt-2 text-sm text-status-out underline hover:no-underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}
