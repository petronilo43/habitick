import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();

  const initialRole = location.state?.role || 'client';
  
  // ESTADOS DO DASHBOARD E VISUALIZAÇÃO
  const [isPro, setIsPro] = useState(initialRole === 'pro');
  const [viewMode, setViewMode] = useState(initialRole === 'pro' ? 'pro' : 'client');
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [activeRequests, setActiveRequests] = useState([]);

  // ESTADOS DE PLANOS SEPARADOS
  const [clientPlan, setClientPlan] = useState('free');
  const [proPlan, setProPlan] = useState(initialRole === 'pro' ? 'pro' : 'free');
  const [isManagingPlan, setIsManagingPlan] = useState(false);

  // ESTADOS DO MENU DIREITO E MODAIS DE CONTEÚDO
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null);

  // ESTADOS DO PERFIL E SALDO
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [userAddress, setUserAddress] = useState('V94 XXXX, Limerick');
  const [userBalance, setUserBalance] = useState("0.00"); // Saldo simulado do usuário

  const currentActivePlan = viewMode === 'client' ? clientPlan : proPlan;

  const handlePostService = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const budgetValue = parseFloat(formData.get('budget'));

    if (budgetValue < 14.20) {
      alert("❌ Error: Minimum allowed offer is €14.20 (Irish Minimum Wage).");
      return;
    }
    
    const newRequest = {
      id: Date.now(),
      service: formData.get('serviceType'),
      location: formData.get('location'),
      budget: budgetValue.toFixed(2),
      status: 'Searching for Pro...',
      date: new Date().toLocaleDateString()
    };

    setActiveRequests([newRequest, ...activeRequests]);
    setIsNewBookingOpen(false);
  };

  const upgradePlan = () => {
    alert("Redirecting to Stripe... Secure Payment for €7 Premium Plan.");
    if (viewMode === 'client') setClientPlan('pro');
    else {
      setProPlan('pro');
      setIsPro(true);
    }
    setIsManagingPlan(false);
  };

  const downgradePlan = () => {
    if (viewMode === 'client') setClientPlan('free');
    else setProPlan('free');
  };

  const handleMenuClick = (modalType) => {
    setIsMenuOpen(false);
    if (modalType === 'logout') {
      navigate('/');
    } else {
      setActiveModal(modalType);
    }
  };

  return (
    <div className="bg-slate-50 min-h-screen font-sans text-slate-800 relative">
      
      {/* NAVBAR */}
      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center shadow-sm relative z-40">
        <div onClick={() => { setIsManagingPlan(false); navigate('/'); }} className="text-xl font-bold text-slate-900 tracking-tight cursor-pointer">
          Habi<span className="text-emerald-600">tick.ie</span>
        </div>
        
        <div className="hidden sm:flex bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => { setViewMode('client'); setIsManagingPlan(false); }}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition cursor-pointer ${viewMode === 'client' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            🙋‍♂️ Hire Services
          </button>
          <button 
            onClick={() => { setViewMode('pro'); setIsManagingPlan(false); }}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition cursor-pointer ${viewMode === 'pro' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
          >
            💼 Offer Services
          </button>
        </div>

        <div className="flex items-center gap-4 relative">
          {currentActivePlan === 'free' && (
            <button onClick={() => setIsManagingPlan(true)} className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-3 py-2 rounded-lg hover:bg-emerald-200 transition cursor-pointer hidden sm:block">
              🚀 Upgrade
            </button>
          )}
          
          <div onClick={() => setIsMenuOpen(!isMenuOpen)} className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold cursor-pointer hover:bg-slate-800 transition">
            JD
          </div>

          {/* MENU SUSPENSO DROPDOWN */}
          {isMenuOpen && (
            <div className="absolute top-14 right-0 w-56 bg-white border border-slate-200 shadow-xl rounded-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-3 border-b border-slate-100 mb-1 bg-slate-50 rounded-t-xl mt-[-8px]">
                <p className="text-sm font-bold text-slate-900">John Doe</p>
                <p className="text-xs text-slate-500">Balance: <strong className="text-emerald-600">€{userBalance}</strong></p>
              </div>
              <button onClick={() => handleMenuClick('profile')} className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition cursor-pointer flex items-center gap-2"><span>👤</span> Profile Overview</button>
              <button onClick={() => handleMenuClick('wallet')} className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition cursor-pointer flex items-center gap-2"><span>💳</span> Wallet & Balance</button>
              <button onClick={() => handleMenuClick('withdraw')} className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition cursor-pointer flex items-center gap-2"><span>🏦</span> Withdraw Funds</button>
              <button onClick={() => handleMenuClick('support')} className="w-full text-left px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-emerald-600 transition cursor-pointer flex items-center gap-2"><span>🎧</span> Help & Support</button>
              <div className="border-t border-slate-100 mt-1 pt-1">
                <button onClick={() => handleMenuClick('logout')} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition cursor-pointer flex items-center gap-2"><span>🚪</span> Log Out</button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {isMenuOpen && <div onClick={() => setIsMenuOpen(false)} className="fixed inset-0 z-30"></div>}

      <div className="p-6 sm:p-8 max-w-5xl mx-auto">
        {/* TELA DE GERENCIAMENTO DE PLANOS */}
        {isManagingPlan ? (
          <div className="max-w-4xl mx-auto animate-in fade-in duration-300">
            <button onClick={() => setIsManagingPlan(false)} className="text-sm font-bold text-slate-500 mb-4 hover:text-slate-800 cursor-pointer">← Back to Workspace</button>
            <h1 className="text-3xl font-bold text-slate-900 mb-8 text-center border-b border-slate-100 pb-4">Choose your {viewMode === 'client' ? 'Client' : 'Pro'} Plan</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* PLANO FREE */}
              <div className={`bg-white rounded-3xl p-8 border-2 shadow-sm ${currentActivePlan === 'free' ? 'border-slate-300' : 'border-transparent'}`}>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Free Plan</h2>
                <div className="text-4xl font-black mb-6">€0 <span className="text-sm font-normal text-slate-400">/mo</span></div>
                <ul className="space-y-4 mb-8 text-sm text-slate-600">
                  {viewMode === 'client' ? (
                    <><li>✔ Post job requests</li><li>✖ Fast-track matching</li></>
                  ) : (
                    <><li>✔ List your services</li><li>✖ Priority visibility</li></>
                  )}
                </ul>
                {currentActivePlan === 'free' ? <div className="w-full text-center py-3 bg-slate-100 rounded-xl text-slate-500 font-bold">Current Plan</div> : <button onClick={downgradePlan} className="w-full py-3 border border-slate-200 rounded-xl font-bold hover:bg-slate-50">Switch to Free</button>}
              </div>
              {/* PLANO PRO */}
              <div className={`bg-slate-900 rounded-3xl p-8 border-2 shadow-xl relative overflow-hidden ${currentActivePlan === 'pro' ? 'border-emerald-500' : 'border-transparent'}`}>
                <h2 className="text-xl font-bold text-white mb-2">{viewMode === 'client' ? 'Premium Client' : 'Pro Member'}</h2>
                <div className="text-4xl font-black text-white mb-6">€7 <span className="text-sm font-normal text-slate-500">/mo</span></div>
                <ul className="space-y-4 mb-8 text-sm">
                  {viewMode === 'client' ? (
                    <><li className="text-emerald-400 font-bold">✔ Match with pros 3x faster</li><li className="text-slate-300">✔ Exclusive highest-rated workers</li></>
                  ) : (
                    <><li className="text-emerald-400 font-bold">✔ Priority Listing (Show first)</li><li className="text-slate-300">✔ Blue "Verified Pro" Badge</li></>
                  )}
                </ul>
                {currentActivePlan === 'pro' ? <div className="w-full text-center py-3 bg-emerald-600/20 border border-emerald-500 rounded-xl text-emerald-400 font-bold">Current Plan</div> : <button onClick={upgradePlan} className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-500 shadow-lg">Upgrade (€7)</button>}
              </div>
            </div>
          </div>
        ) : (
          /* WORKSPACES COMPACTOS */
          <>
            {viewMode === 'client' ? (
              <div className="animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">My Bookings {clientPlan === 'pro' && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-bold">⭐ VIP Client</span>}</h1>
                    <p className="text-slate-500">Manage your home service requests across Ireland.</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setIsManagingPlan(true)} className="text-sm font-bold text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 shadow-sm hidden sm:block">⚙️ Manage Plan</button>
                    <button onClick={() => setIsNewBookingOpen(true)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-emerald-500">+ Book New Service</button>
                  </div>
                </div>
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                  <h2 className="font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Active Requests</h2>
                  {activeRequests.length === 0 ? <div className="bg-slate-50 rounded-xl p-8 text-center border border-slate-100"><p className="text-slate-600 font-medium">No active bookings right now.</p></div> : (
                    <div className="space-y-4">
                      {activeRequests.map((req) => (
                        <div key={req.id} className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex justify-between items-center">
                          <div><h3 className="font-bold text-slate-900 text-lg">{req.service}</h3><p className="text-sm text-slate-500">📍 {req.location} • €{req.budget}</p><span className="inline-block mt-2 text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-1 rounded-md">🔄 {req.status}</span></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">Pro Workspace {proPlan === 'pro' && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full font-bold">🛡️ Verified Pro</span>}</h1>
                    <p className="text-slate-500">Manage your tasks and track your Irish earnings.</p>
                  </div>
                  <button onClick={() => setIsManagingPlan(true)} className="text-sm font-bold text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-xl hover:bg-slate-50 shadow-sm">⚙️ Manage Plan</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm"><h2 className="font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Jobs near you</h2><div className="bg-slate-50 rounded-xl p-6 text-center text-sm text-slate-500 italic">Waiting for new requests in your Eircode area...</div></div>
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm"><h2 className="font-bold text-slate-800 mb-4 border-b border-slate-100 pb-2">Earnings</h2><div className="text-4xl font-extrabold text-slate-900 mb-1">€{userBalance}</div><p className="text-xs text-slate-400">Withdrawals processed via SEPA (Irish Banks).</p></div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* =======================================================
          MODAIS INTERATIVOS DAS OPÇÕES DO MENU DA DIREITA
          ======================================================= */}

      {/* 1. MODAL: PROFILE SETTINGS */}
      {activeModal === 'profile' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
            <button 
              onClick={() => { setActiveModal(null); setIsEditingAddress(false); }} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
            >
              &times;
            </button>
            <h3 className="text-xl font-bold text-slate-900 mb-1">👤 Profile Overview</h3>
            <p className="text-xs text-slate-500 mb-6">Your public Habitick identity.</p>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md">JD</div>
              <div>
                <h4 className="font-bold text-slate-900 text-lg leading-tight">John Doe</h4>
                <p className="text-sm text-slate-500">28 years old • {viewMode === 'pro' && proPlan === 'pro' ? 'Verified Pro' : (viewMode === 'pro' ? 'Independent Pro' : 'Client')}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Total Services</p>
                <p className="text-2xl font-black text-slate-900">14</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Average Rating</p>
                <p className="text-2xl font-black text-slate-900">4.9 <span className="text-sm">⭐</span></p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-5">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">Registered Eircode / Area</label>
                {!isEditingAddress && (
                  <button onClick={() => setIsEditingAddress(true)} className="text-xs font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer hover:underline">
                    Edit
                  </button>
                )}
              </div>
              
              {isEditingAddress ? (
                <form 
                  onSubmit={(e) => { e.preventDefault(); setIsEditingAddress(false); alert("Location updated successfully!"); }} 
                  className="flex gap-2 animate-in fade-in duration-200"
                >
                  <input type="text" value={userAddress} onChange={(e) => setUserAddress(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-emerald-300 bg-white text-sm focus:outline-emerald-600 shadow-sm" required />
                  <button type="submit" className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-emerald-500 cursor-pointer">Save</button>
                </form>
              ) : (
                <div className="bg-slate-50 px-4 py-3 rounded-xl border border-slate-100 text-sm font-medium text-slate-800">📍 {userAddress}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. MODAL: WALLET & BALANCE */}
      {activeModal === 'wallet' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            <h3 className="text-xl font-bold text-slate-900 mb-1">💳 Habitick Secure Wallet</h3>
            <p className="text-xs text-slate-500 mb-6">Track your ongoing transactions and statement.</p>
            <div className="bg-slate-900 text-white p-6 rounded-2xl text-center shadow-inner mb-6">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Available Balance</p>
              <p className="text-5xl font-black mt-2 text-emerald-400">€{userBalance}</p>
              <p className="text-[11px] text-slate-400 mt-2">All payments are secured via Stripe Escrow system.</p>
            </div>
            <div className="border border-slate-100 rounded-xl p-4 bg-slate-50 text-xs text-slate-500">
              <p className="font-bold text-slate-700 mb-2">Statement History</p>
              <p className="italic">No transaction history found for this month.</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. MODAL: WITHDRAW FUNDS (ATUALIZADO COM CARTÃO DE SALDO) */}
      {activeModal === 'withdraw' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            <h3 className="text-xl font-bold text-slate-900 mb-1">🏦 Bank Payout (SEPA)</h3>
            <p className="text-xs text-slate-500 mb-4">Transfer your earnings directly to your Irish bank account.</p>
            
            {/* NOVO: CARTÃO DE SALDO DISPONÍVEL NO SAQUE */}
            <div className="bg-slate-900 text-white p-4 rounded-xl flex justify-between items-center mb-6 shadow-inner">
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Available Balance</p>
                <p className="text-2xl font-black text-emerald-400">€{userBalance}</p>
              </div>
              <span className="text-3xl opacity-80">💰</span>
            </div>

            <form onSubmit={(e) => { 
              e.preventDefault(); 
              const amount = parseFloat(e.target.withdrawAmount.value);
              if(amount > parseFloat(userBalance)) {
                alert("❌ Insufficient funds. You cannot withdraw more than your available balance.");
                return;
              }
              setActiveModal(null); 
              alert("Payout request received! Funds will arrive in 1-2 business days."); 
            }} className="space-y-4">
              <div className="bg-emerald-50 text-emerald-800 text-xs p-3 rounded-xl border border-emerald-100 flex items-center gap-2 font-medium">
                <span>🔒</span> Habitick charges 0% commission on payouts.
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Amount to Withdraw (€)</label>
                <input type="number" name="withdrawAmount" placeholder="Min. €5.00" min="5" step="0.01" max={userBalance} className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-emerald-600" required />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Irish IBAN</label>
                <input type="text" placeholder="IEAA AAAA BBBB CCCC DDDD EE" className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-emerald-600" required />
              </div>
              <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 transition cursor-pointer">Request Withdrawal</button>
            </form>
          </div>
        </div>
      )}

      {/* 4. MODAL: HELP & SUPPORT */}
      {activeModal === 'support' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer">&times;</button>
            <h3 className="text-xl font-bold text-slate-900 mb-1">🎧 Local Customer Support</h3>
            <p className="text-xs text-slate-500 mb-6">We are here to help you. Response time is usually under 1 hour.</p>
            <div className="space-y-3 mb-6">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center">
                <div><p className="text-xs text-slate-500 font-bold uppercase">Official Support Email</p><p className="text-sm font-semibold text-slate-900">support@habitick.ie</p></div>
                <a href="mailto:support@habitick.ie" className="text-xs font-bold text-emerald-600 hover:underline">Send Email</a>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center">
                <div><p className="text-xs text-slate-500 font-bold uppercase">Emergency Ticket</p><p className="text-sm font-semibold text-slate-900">Open a live dashboard dispute</p></div>
                <button onClick={() => alert("Ticket opened. Our Limerick-based support will review your account status shortly.")} className="text-xs font-bold text-emerald-600 hover:underline cursor-pointer">Open Ticket</button>
              </div>
            </div>
            <div className="text-[11px] text-center text-slate-400 bg-slate-50 p-2 rounded-lg">Operating hours: 8:00 AM to 10:00 PM (GMT) • Registered in Ireland</div>
          </div>
        </div>
      )}

      {/* MODAL DE NOVO SERVIÇO (SÓ PARA CLIENTES) */}
      {isNewBookingOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative">
            <button onClick={() => setIsNewBookingOpen(false)} className="absolute top-4 right-4 text-slate-400 font-bold text-xl cursor-pointer">&times;</button>
            <h3 className="text-xl font-bold text-slate-900 mb-1">Post a Job</h3>
            <form onSubmit={handlePostService} className="space-y-4">
              <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Service Type</label><select name="serviceType" className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50"><option>Home Cleaning</option><option>Gardening</option><option>Car Wash</option></select></div>
              <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Eircode / Location</label><input type="text" name="location" required placeholder="e.g. V94 XXXX" className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50" /></div>
              <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Hourly Offer</label><div className="relative"><span className="absolute left-4 top-2 text-slate-400 font-bold">€</span><input type="number" name="budget" required min="14.20" step="0.01" className="w-full pl-8 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50" /></div><p className="text-[11px] text-emerald-600 mt-1">🛡️ Minimum €14.20/hr required by law.</p></div>
              <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 shadow-md cursor-pointer">Post Request</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}