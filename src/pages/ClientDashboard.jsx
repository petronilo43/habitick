import React from 'react';

export default function ClientDashboard() {
  return (
    <div className="bg-slate-50 min-h-screen p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm p-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">My Bookings</h1>
        <p className="text-slate-500 mb-8">Manage your home service requests across Ireland.</p>
        
        <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
          <h2 className="font-semibold text-slate-800 mb-4">Active Requests</h2>
          <p className="text-sm text-slate-500 italic">No active requests at the moment. Return home to book a service.</p>
        </div>
      </div>
    </div>
  );
}