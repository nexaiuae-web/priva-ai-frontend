import React from 'react';

export default function SupportChat({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 h-96 bg-gray-900 border border-green-700 rounded-lg shadow-xl p-4 text-white">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold">Support Chat</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white">X</button>
      </div>
      <div className="h-64 overflow-y-auto mb-4 bg-gray-800 rounded p-2">
        <p className="text-sm">Welcome! How can we help you today?</p>
      </div>
      <input type="text" className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-sm" placeholder="Type a message..." />
    </div>
  );
}
