import { Send, X } from "lucide-react";

export default function SupportChat({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-96 w-80 flex-col overflow-hidden rounded-lg border border-green-800 bg-[#0d1512] p-4 text-gray-100 shadow-xl sm:bottom-6 sm:right-6">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <h3 className="font-bold text-gray-100">Support Chat</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 transition-colors hover:text-white"
          aria-label="Close support chat"
        >
          <X size={18} />
        </button>
      </div>

      <div className="mb-4 min-h-0 flex-1 overflow-y-auto rounded border border-green-800/40 bg-[#132a22] p-2">
        <p className="text-sm text-gray-100">
          Welcome! How can we help you today?
        </p>
      </div>

      <form
        className="flex shrink-0 gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          type="text"
          className="min-w-0 flex-1 rounded border border-green-800/50 bg-[#1a3329] p-2 text-sm text-gray-100 placeholder-gray-500 outline-none transition-colors focus:border-green-700/70 focus:ring-1 focus:ring-green-600/30"
          placeholder="Type a message..."
          aria-label="Support message"
        />
        <button
          type="submit"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white transition-colors hover:bg-green-500"
          aria-label="Send message"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
