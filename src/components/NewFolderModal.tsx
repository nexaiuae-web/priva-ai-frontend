import { useState } from "react";
import { FolderPlus, X } from "lucide-react";

interface NewFolderModalProps {
  open: boolean;
  loading?: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}

export function NewFolderModal({
  open,
  loading = false,
  onClose,
  onCreate,
}: NewFolderModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Folder name is required.");
      return;
    }
    setError("");
    try {
      await onCreate(trimmed);
      setName("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={() => !loading && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[#00E699]/20 p-6 shadow-xl"
        style={{ background: "rgba(4, 28, 21, 0.95)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-folder-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3
            id="new-folder-title"
            className="flex items-center gap-2 text-base font-semibold text-white"
          >
            <FolderPlus size={18} className="text-[#00E699]" />
            New Folder
          </h3>
          <button
            type="button"
            className="rounded-lg p-1 text-[#A3B8B0] hover:bg-[#054232]/50 hover:text-white"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="mb-1 block text-xs font-medium text-[#A3B8B0]" htmlFor="folderName">
            Folder name
          </label>
          <input
            id="folderName"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="e.g. HR Policies"
            className="w-full rounded-xl border border-[#00E699]/20 bg-[#041C15]/50 px-4 py-3 text-sm text-white outline-none focus:border-[#00E699]/50"
            autoFocus
            disabled={loading}
          />
          {error ? (
            <p className="mt-2 text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg px-4 py-2 text-xs font-semibold uppercase text-[#A3B8B0] hover:text-white"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-50"
              style={{ background: "#054232" }}
              disabled={loading}
            >
              {loading ? "Creating…" : "Create Folder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
