import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import { supabase } from './supabaseClient'; 

export default function App() {
  const navigate = useNavigate();
  
  // =========================================================================
  // 1. SESSÃO PERSISTENTE (Mantém o usuário logado)
  // =========================================================================
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Verifica a sessão assim que o site abre
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Fica "escutando" se o usuário fez login ou logout
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    showToast("Logged out successfully.", "success");
    navigate('/');
  };

  // =========================================================================
  // 2. SISTEMA DE NOTIFICAÇÕES PROFISSIONAIS
  // =========================================================================
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // =========================================================================
  // 3. INTRODUÇÃO INICIAL (1x por sessão)
  // =========================================================================
  const [showIntro, setShowIntro] = useState(() => !sessionStorage.getItem('habitickIntroSeen'));
  const [introStep, setIntroStep] = useState(0);

  useEffect(() => {
    if (showIntro) {
      setTimeout(() => setIntroStep(1), 100);
      setTimeout(() => setIntroStep(2), 700);
      setTimeout(() => setIntroStep(3), 1800);
      setTimeout(() => { setShowIntro(false); sessionStorage.setItem('habitickIntroSeen', 'true'); }, 2500);
    }
  }, [showIntro]);

  // =========================================================================
  // 4. MINI-CORTINA DE TRANSIÇÃO
  // =========================================================================
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState('Habi tick.ie');

  const runActionWithTransition = async (action, successMsg) => {
    setIsTransitioning(true);
    setTransitionMessage('Habi tick.ie'); 
    await new Promise(r => setTimeout(r, 400));
    const success = await action();
    if (success) {
      setTransitionMessage(successMsg);
      await new Promise(r => setTimeout(r, 1000));
    }
    setIsTransitioning(false);
  };

  // =========================================================================
  // 5. ESTADOS E DADOS (CATÁLOGO DE SERVIÇOS)
  // =========================================================================
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); 
  const [userRole, setUserRole] = useState('client'); 
  const [previewService, setPreviewService] = useState(null);
  
  const [selectedService, setSelectedService] = useState(null);
  const [extraOption, setExtraOption] = useState('');
  const [otherText, setOtherText] = useState('');

  const services = [
    { 
      id: 1, icon: '🧹', name: 'Home Cleaning', desc: 'Deep or regular cleaning for houses and apartments nationwide.', priceLabel: 'From €14.50/hr',
      customField: { label: 'Property Size', options: ['1 Bedroom / Studio', '2-3 Bedrooms', '4+ Bedrooms', 'Other'] }
    },
    { 
      id: 2, icon: '🏡', name: 'Gardening & Lawn', desc: 'Lawn mowing, hedge trimming, weeding, and general garden cleanups.', priceLabel: 'From €29.00 fixed',
      customField: { label: 'Garden Condition', options: ['Regular Maintenance', 'Overgrown / Needs deep clean', 'Green Waste Removal', 'Other'] }
    },
    { 
      id: 3, icon: '🚗', name: 'Eco Car Valeting', desc: 'Premium waterless exterior car wash and interior vacuuming right at your driveway.', priceLabel: 'From €35.00 fixed',
      customField: { label: 'Vehicle Size', options: ['Hatchback / Small', 'Saloon / Sedan', 'SUV / 7-Seater / Van', 'Other'] }
    },
    { 
      id: 4, icon: '🐕', name: 'Dog Walking', desc: 'Reliable, fully insured local walkers to exercise your dog in your neighborhood.', priceLabel: 'From €15.00/hr',
      customField: { label: 'Walk Duration', options: ['30 Minutes', '1 Hour', '2 Hours', 'Other'] }
    },
    { 
      id: 5, icon: '💆‍♂️', name: 'Massage Therapy', desc: 'Leisure, therapeutic, and relaxation massages conducted by certified professionals at your home.', priceLabel: 'From €55.00 fixed',
      customField: { label: 'Massage Type', options: ['Relaxation (50 min)', 'Deep Tissue (50 min)', 'Sports Recovery', 'Other'] }
    },
    { 
      id: 6, icon: '📦', name: 'Item Transport', desc: 'Need to move boxes, furniture, or fetch an item? Quick courier and local transport on demand.', priceLabel: 'From €20.00 fixed',
      customField: { label: 'Item Size', options: ['Small Bags/Boxes', 'Medium Furniture (e.g. Chair)', 'Large Items (e.g. Sofa, Bed)', 'Other'] }
    },
    { 
      id: 7, icon: '🎨', name: 'House Painting', desc: 'Professional interior wall painting, door skirting, and exterior detailing.', priceLabel: 'From €18.50/hr',
      customField: { label: 'Scope of Work', options: ['1 Room or Feature Wall', '2-3 Rooms', 'Whole House Interior', 'Exterior / Fences', 'Other'] }
    },
    { 
      id: 8, icon: '🔨', name: 'Handyman / Repairs', desc: 'Small home construction works, furniture assembly, TV wall mounting, and general property maintenance.', priceLabel: 'From €25.00/hr',
      customField: { label: 'Required Task', options: ['Furniture Assembly (IKEA etc)', 'TV Wall Mounting', 'Plumbing (Leaking Taps, etc)', 'Hanging Pictures / Shelves', 'Other'] }
    },
    { 
      id: 9, icon: '🔧', name: 'Mobile Mechanic', desc: 'On-demand car diagnostics, battery jumps, roadside tyre changes, and minor mechanical fixes.', priceLabel: 'From €40.00 fixed',
      customField: { label: 'Vehicle Issue', options: ['Dead Battery Jump Start', 'Flat Tyre Change', 'Computer Diagnostics Scan', 'Brakes Inspection', 'Other'] }
    }
  ];

  const startBooking = (serviceItem) => {
    // Se o usuário não estiver logado, obriga ele a criar conta antes de agendar!
    if (!session) {
      setPreviewService(null);
      setAuthMode('register');
      setUserRole('client');
      setIsAuthOpen(true);
      showToast("Please create an account to book a service.", "success");
      return;
    }

    setSelectedService(serviceItem);
    setPreviewService(null);
    setExtraOption(''); 
    setOtherText(''); 
    setIsBookingOpen(true);
  };

  // =========================================================================
  // 6. AUTENTICAÇÃO
  // =========================================================================
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const password = formData.get('password');

    if (authMode === 'register') {
      if (email !== formData.get('confirmEmail')) { showToast("Emails do not match. Please check.", "error"); return; }
      if (password !== formData.get('confirmPassword')) { showToast("Passwords do not match. Please check.", "error"); return; }
      
      setIsAuthOpen(false); 
      runActionWithTransition(async () => {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { role: userRole } } });
        if (error) { showToast(error.message, "error"); setIsAuthOpen(true); return false; }
        navigate('/dashboard', { state: { role: userRole } });
        return true; 
      }, "Account Created! ✔");
    }

    if (authMode === 'login') {
      setIsAuthOpen(false);
      runActionWithTransition(async () => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { showToast("Invalid login credentials. Please try again.", "error"); setIsAuthOpen(true); return false; }
        const role = data.user?.user_metadata?.role || 'client';
        navigate('/dashboard', { state: { role: role } });
        return true;
      }, "Welcome Back! 🔓");
    }
  };

  return (
    <>
      {/* TOAST SYSTEM */}
      {toast.show && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-10 duration-300 font-medium ${toast.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          <span className="text-xl">{toast.type === 'error' ? '🛑' : '✨'}</span>{toast.message}
        </div>
      )}

      {/* MINI-CORTINA DE TRANSIÇÃO */}
      <div className={`fixed inset-0 z-[9000] bg-slate-900 flex items-center justify-center transition-all duration-500 ease-in-out ${isTransitioning ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`}>
        <div className="text-center">
           <div className="text-3xl sm:text-4xl font-black text-white tracking-tighter animate-pulse">
            {transitionMessage === 'Habi tick.ie' ? (<>Habi<span className="text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.8)]">tick.ie</span></>) : (<span className="text-emerald-400 animate-in zoom-in duration-300">{transitionMessage}</span>)}
          </div>
        </div>
      </div>

      {/* INTRODUÇÃO INICIAL */}
      {showIntro && (
        <div className={`fixed inset-0 z-[9999] bg-slate-900 flex flex-col items-center justify-center transition-transform duration-700 ease-in-out ${introStep === 3 ? '-translate-y-full' : 'translate-y-0'}`}>
          <div className="flex items-center text-5xl sm:text-7xl font-extrabold text-white tracking-tight overflow-hidden"><span className={`transition-all duration-700 ease-out ${introStep >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>Habi</span><span className={`transition-all duration-700 ease-out text-emerald-500 ${introStep >= 2 ? 'opacity-100 scale-100 drop-shadow-[0_0_20px_rgba(16,185,129,0.8)]' : 'opacity-0 scale-50'}`}>tick.ie</span></div>
          <div className={`mt-6 w-48 h-1 bg-slate-800 rounded-full overflow-hidden transition-opacity duration-500 ${introStep >= 1 ? 'opacity-100' : 'opacity-0'}`}><div className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-in-out" style={{ width: introStep >= 2 ? '100%' : '0%' }}></div></div>
        </div>
      )}

      <Routes>
        <Route path="/" element={
          <div className="bg-slate-50 min-h-screen font-sans text-slate-800 flex flex-col justify-between">
            <div className="flex-grow">
              
              {/* NAVBAR DINÂMICA (Muda se estiver logado) */}
              <nav className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center bg-white shadow-sm rounded-b-xl">
                <div className="text-2xl font-bold text-slate-900 tracking-tight cursor-pointer">Habi<span className="text-emerald-600">tick.ie</span></div>
                <div className="flex gap-3 sm:gap-5 items-center">
                  
                  {/* LÓGICA DE EXIBIÇÃO: Se logado, mostra Dashboard. Se não, mostra Login/Register */}
                  {session ? (
                    <>
                      <button onClick={() => navigate('/dashboard', { state: { role: session.user?.user_metadata?.role || 'client' } })} className="text-sm font-bold text-emerald-600 hover:text-emerald-800 transition active:scale-95 cursor-pointer flex items-center gap-2"><span>📊</span> Dashboard</button>
                      <span className="text-slate-200 hidden sm:inline">|</span>
                      <button onClick={handleLogout} className="bg-slate-100 text-slate-600 text-sm px-4 py-2 rounded-lg font-bold hover:bg-slate-200 transition shadow-sm active:scale-95 cursor-pointer">Log Out</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => {setAuthMode('pricing'); setIsAuthOpen(true);}} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition active:scale-95 cursor-pointer">Become a Pro</button>
                      <span className="text-slate-200 hidden sm:inline">|</span>
                      <button onClick={() => {setAuthMode('login'); setIsAuthOpen(true);}} className="text-sm font-medium text-slate-600 hover:text-slate-900 transition active:scale-95 cursor-pointer">Login</button>
                      <button onClick={() => { setUserRole('client'); setAuthMode('register'); setIsAuthOpen(true); }} className="bg-slate-900 text-white text-sm px-4 py-2 rounded-lg font-medium hover:bg-slate-800 transition shadow-sm active:scale-95 cursor-pointer">Register</button>
                    </>
                  )}

                </div>
              </nav>

              {/* HERO SECTION */}
              <section className="max-w-5xl mx-auto px-6 pt-16 pb-12 text-center">
                <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">Ireland's On-Demand Home Services</span>
                <h1 className="mt-6 text-4xl sm:text-6xl font-extrabold text-slate-900 tracking-tight leading-none">Your home, sorted <br /><span className="text-emerald-600">at the click of a button.</span></h1>
                <p className="mt-6 text-lg text-slate-600 max-w-2xl mx-auto">Premium home on-demand marketplace across Ireland. Trusted local professionals, fair pricing starting at minimum wage, and instant booking.</p>
              </section>

              {/* SERVIÇOS (CATÁLOGO) */}
              <section className="max-w-6xl mx-auto px-6 py-12">
                <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">Select a service to view details & book</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-6">
                  {services.map((s) => (
                    <div key={s.id} onClick={() => setPreviewService(s)} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md hover:border-slate-200 transition-all duration-200 cursor-pointer flex flex-col justify-between active:scale-95">
                      <div>
                        <div className="text-4xl mb-3">{s.icon}</div>
                        <h3 className="text-lg font-bold text-slate-900 tracking-tight">{s.name}</h3>
                        <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-wider">{s.priceLabel}</p>
                      </div>
                      <div className="mt-6 text-xs font-bold text-emerald-600 flex items-center gap-1">View Details <span>→</span></div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* FOOTER */}
            <footer className="bg-white border-t border-slate-100 mt-16">
              <div className="max-w-7xl mx-auto px-6 py-10 md:flex md:items-center md:justify-between">
                <div><div className="text-xl font-bold text-slate-900 tracking-tight">Habi<span className="text-emerald-600">tick.ie</span></div><p className="text-sm text-slate-500 mt-2 max-w-xs">The smartest way to book trusted home services in Ireland.</p></div>
                <div className="flex gap-x-8 text-sm text-slate-600"><button onClick={() => {setAuthMode('pricing'); setIsAuthOpen(true);}} className="hover:text-emerald-600 transition cursor-pointer">Premium Plans</button><span className="text-slate-500">Contact: <strong>support@habitick.ie</strong></span></div>
              </div>
            </footer>

            {/* MODAL DE DETALHES DO SERVIÇO */}
            {previewService && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
                  <button onClick={() => setPreviewService(null)} className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 font-bold text-xl active:scale-90 transition cursor-pointer">&times;</button>
                  <div className="text-5xl mb-4">{previewService.icon}</div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">{previewService.name}</h3>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4"><p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Service Description</p><p className="text-sm text-slate-600 leading-relaxed">{previewService.desc}</p></div>
                  <div className="flex justify-between items-center mb-6 px-1"><div><p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Estimated Rate</p><p className="text-xl font-extrabold text-slate-900">{previewService.priceLabel}</p></div><span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-semibold border border-emerald-100">Verified Pros</span></div>
                  <button onClick={() => startBooking(previewService)} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 shadow-md transition active:scale-95 cursor-pointer">Book This Service</button>
                </div>
              </div>
            )}

            {/* MODAL DE AGENDAMENTO DINÂMICO */}
            {isBookingOpen && selectedService && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
                  <button onClick={() => setIsBookingOpen(false)} className="absolute top-4 right-4 text-slate-400 font-bold text-xl cursor-pointer hover:text-slate-600">&times;</button>
                  <h3 className="text-xl font-bold text-slate-900 mb-4">Book <span className="text-emerald-600">{selectedService.name}</span></h3>
                  
                  <form onSubmit={(e) => { e.preventDefault(); setIsBookingOpen(false); runActionWithTransition(() => navigate('/dashboard', { state: { role: 'client' } }), "Booking Started! ✔"); }} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">{selectedService.customField.label}</label>
                      <select required value={extraOption} onChange={(e) => setExtraOption(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500 cursor-pointer">
                        <option value="" disabled>Select an option</option>
                        {selectedService.customField.options.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>

                    {extraOption === 'Other' && (
                      <div className="animate-in fade-in slide-in-from-top-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Please Specify</label>
                        <textarea required placeholder="Tell the Pro what you need..." value={otherText} onChange={(e) => setOtherText(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500 text-sm h-20 resize-none" />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Eircode / Area</label><input type="text" required placeholder="V94 XXXX" className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500" /></div>
                      <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">Date</label><input type="date" required className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500 text-sm" /></div>
                    </div>
                    
                    <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition active:scale-95 cursor-pointer mt-2">Proceed to Matching</button>
                  </form>
                </div>
              </div>
            )}

            {/* MODAL DE AUTENTICAÇÃO */}
            {isAuthOpen && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
                <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
                  <button onClick={() => setIsAuthOpen(false)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 font-bold text-xl transition cursor-pointer">&times;</button>
                  
                  {authMode === 'pricing' && (
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 mb-6">Habitick Premium</h3>
                      <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl mb-6">
                        <button type="button" onClick={() => setUserRole('client')} className={`py-2 text-sm font-semibold rounded-lg transition active:scale-95 cursor-pointer ${userRole === 'client' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>🙋‍♂️ Client</button>
                        <button type="button" onClick={() => setUserRole('pro')} className={`py-2 text-sm font-semibold rounded-lg transition active:scale-95 cursor-pointer ${userRole === 'pro' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>💼 Pro</button>
                      </div>
                      <div className="bg-slate-900 text-white rounded-2xl p-6 mb-6">
                        <p className="text-4xl font-black mb-2">€7<span className="text-sm font-normal text-slate-400"> /1st mo</span></p>
                        <ul className="text-sm text-slate-300 space-y-2">
                          <li>✔ {userRole === 'client' ? 'Access to 5-star Pros' : 'Priority Listing in Area'}</li>
                          <li>✔ Cancel anytime</li>
                        </ul>
                      </div>
                      <button onClick={() => setAuthMode('register')} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 shadow-md transition active:scale-95 cursor-pointer">Continue to Register</button>
                    </div>
                  )}

                  {authMode === 'register' && (
                    <form onSubmit={handleAuthSubmit} className="space-y-4">
                      <h3 className="text-2xl font-bold text-slate-900 mb-1">Create Account</h3>
                      <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email</label><input type="email" name="email" required className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500" /></div>
                      <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Confirm Email</label><input type="email" name="confirmEmail" required className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500" /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Password</label><input type="password" name="password" required className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500" /></div>
                        <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Confirm</label><input type="password" name="confirmPassword" required className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500" /></div>
                      </div>
                      <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold mt-4 hover:bg-slate-800 transition active:scale-95 cursor-pointer">Register Account</button>
                    </form>
                  )}

                  {authMode === 'login' && (
                    <form onSubmit={handleAuthSubmit} className="space-y-4">
                      <h3 className="text-2xl font-bold text-slate-900 mb-1">Welcome Back</h3>
                      <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email</label><input type="email" name="email" required className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500" /></div>
                      <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Password</label><input type="password" name="password" required className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-emerald-500" /></div>
                      <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold mt-4 hover:bg-slate-800 transition active:scale-95 cursor-pointer">Log In</button>
                    </form>
                  )}

                  <div className="text-center text-xs text-slate-400 pt-4 mt-4 border-t border-slate-100">
                    {authMode !== 'login' ? <p>Have an account? <span onClick={() => setAuthMode('login')} className="text-emerald-600 font-bold cursor-pointer hover:underline transition">Log in</span></p> : <p>New here? <span onClick={() => setAuthMode('pricing')} className="text-emerald-600 font-bold cursor-pointer hover:underline transition">Join Habitick</span></p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        } />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </>
  );
}