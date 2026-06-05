import React from 'react';

export default function ProDashboard() {
  return (
    <div className="bg-slate-50 min-h-screen p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-8 border-t-4 border-emerald-600">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Pro Workspace</h1>
        <p className="text-slate-500 mb-8">Manage your specialty, schedule, and view available jobs.</p>
        
        <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100 mb-6">
          <h2 className="font-semibold text-emerald-900 mb-2">Subscription Active</h2>
          <p className="text-sm text-emerald-700">Your €7 Premium Plan is active. You are listed at the top for local clients.</p>
        </div>

        <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
          <h2 className="font-semibold text-slate-800 mb-4">Available Jobs near you</h2>
          <p className="text-sm text-slate-500 italic">Waiting for new requests in your selected Eircode area...</p>
        </div>
      </div>
    </div>
  );
}