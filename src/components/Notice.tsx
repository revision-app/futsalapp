type NoticeProps = {
  message?: string;
  error?: string;
};

export function Notice({ message, error }: NoticeProps) {
  if (!message && !error) return null;

  return (
    <div
      className={
        error
          ? "rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          : "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      }
    >
      {error || message}
    </div>
  );
}
