import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient'; // Ajuste o caminho se necessário

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // =========================================================================
  // 1. ESTADOS DE SESSÃO E PERFIL
  // =========================================================================
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(location.state?.role || 'client');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // =========================================================================
  // 2. SISTEMA DE NOTIFICAÇÕES (Consistência com a App.jsx)
  // =========================================================================
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000);
  };

  // =========================================================================
  // 3. VERIFICAÇÃO DE SEGURANÇA (Redireciona se não estiver logado)
  // =========================================================================
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (!session) {
        navigate('/');
        return;
      }
      
      setUser(session.user);
      // Puxa a role do banco de dados (caso não tenha vindo pela navegação)
      if (session.user.user_metadata?.role) {
        setRole(session.user.user_metadata.role);
      }
      setLoading(false);
    };
    
    checkUser();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-emerald-500 font-bold text-xl animate-pulse">Loading Habitick...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      
      {/* TOAST SYSTEM */}
      {toast.show && (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[10000] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-10 duration-300 font-medium ${toast.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          <span className="text-xl">{toast.type === 'error' ? '🛑' : '✨'}</span>{toast.message}
        </div>
      )}

      {/* NAVBAR DO DASHBOARD */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div onClick={() => navigate('/')} className="text-2xl font-black text-slate-900 tracking-tight cursor-pointer hover:opacity-80 transition">
            Habi<span className="text-emerald-600">tick.ie</span>
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-slate-500 hidden sm:block bg-slate-100 px-3 py-1 rounded-full capitalize">
              {role} Mode
            </span>
            <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold shadow-md cursor-pointer hover:bg-emerald-700 transition active:scale-95">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row gap-8">
        
        {/* MENU LATERAL (Sidebar Estilo Airbnb) */}
        <aside className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-4 sticky top-24">
            <div className="mb-6 px-4 pt-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">My Account</p>
              <p className="font-bold text-slate-900 truncate">{user?.email}</p>
            </div>
            
            <div className="space-y-1">
              <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition cursor-pointer active:scale-95 ${activeTab === 'overview' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <span className="text-lg">📊</span> Dashboard
              </button>
              <button onClick={() => setActiveTab('bookings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition cursor-pointer active:scale-95 ${activeTab === 'bookings' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <span className="text-lg">📅</span> {role === 'client' ? 'My Bookings' : 'My Jobs'}
              </button>
              <button onClick={() => setActiveTab('wallet')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition cursor-pointer active:scale-95 ${activeTab === 'wallet' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <span className="text-lg">💳</span> Wallet & Payouts
              </button>
              <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition cursor-pointer active:scale-95 ${activeTab === 'settings' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <span className="text-lg">⚙️</span> Settings
              </button>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-100">
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition cursor-pointer active:scale-95">
                <span className="text-lg">🚪</span> Log Out
              </button>
            </div>
          </div>
        </aside>

        {/* ÁREA DE CONTEÚDO PRINCIPAL */}
        <main className="flex-grow">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-8">
            Good afternoon, {user?.email?.split('@')[0]} 👋
          </h1>

          {/* ================================================================
              VISÃO DO CLIENTE (Foco em Conversão e Agendamento Estilo Uber)
              ================================================================ */}
          {role === 'client' && activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* BANNER APELATIVO (Estilo Airbnb Premium) */}
              <div className="bg-slate-900 rounded-3xl p-8 relative overflow-hidden shadow-xl shadow-slate-900/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
                <div className="relative z-10">
                  <span className="bg-emerald-500 text-white text-xs font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-md">Habitick Premium</span>
                  <h2 className="text-2xl sm:text-3xl font-black text-white mt-4 mb-2">Need your home sorted today?</h2>
                  <p className="text-slate-300 max-w-md text-sm mb-6 leading-relaxed">Book a top-rated professional now and skip the waiting list. Secure payments and guaranteed quality.</p>
                  <button onClick={() => navigate('/')} className="bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:bg-slate-100 transition active:scale-95 cursor-pointer shadow-lg">
                    Explore Services →
                  </button>
                </div>
              </div>

              {/* QUICK BOOK (Ícones rápidos estilo Uber) */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 px-1">Quick Book</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                  {[
                    { icon: '🧹', name: 'Cleaning' },
                    { icon: '🏡', name: 'Gardening' },
                    { icon: '🚗', name: 'Car Wash' },
                    { icon: '🔨', name: 'Handyman' },
                    { icon: '➕', name: 'More' }
                  ].map((item, idx) => (
                    <div key={idx} onClick={() => navigate('/')} className="flex flex-col items-center gap-2 cursor-pointer group active:scale-95 transition-transform">
                      <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center text-3xl group-hover:border-emerald-300 group-hover:shadow-md transition-all">
                        {item.icon}
                      </div>
                      <span className="text-xs font-bold text-slate-600">{item.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* STATUS DO AGENDAMENTO ATUAL */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 px-1">Active Bookings</h3>
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 flex items-center gap-6">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center text-2xl border border-slate-100">
                    📭
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">No active bookings right now.</p>
                    <p className="text-sm text-slate-500 mt-1">When you book a service, you can track the Pro's arrival here.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================
              VISÃO DO PROFISSIONAL (Foco em Ganhos e Trabalhos Disponíveis)
              ================================================================ */}
          {role === 'pro' && activeTab === 'overview' && (
            <div className="space-y-6">
              
              {/* MÉTRICAS (Estilo Uber Driver) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Weekly Earnings</p>
                  <p className="text-3xl font-black text-slate-900">€0.00</p>
                </div>
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Jobs Completed</p>
                  <p className="text-3xl font-black text-slate-900">0</p>
                </div>
                <div className="bg-slate-900 p-6 rounded-3xl shadow-md border border-slate-800 text-white flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute -right-4 -bottom-4 text-6xl opacity-20">⭐</div>
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1 relative z-10">Pro Rating</p>
                  <p className="text-3xl font-black relative z-10">New</p>
                </div>
              </div>

              {/* MURAL DE TRABALHOS (Job Board) */}
              <div>
                <div className="flex justify-between items-center mb-4 px-1">
                  <h3 className="text-lg font-bold text-slate-900">Available Jobs Near You</h3>
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                    <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>
                    Looking for requests...
                  </div>
                </div>
                
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 text-center flex flex-col items-center justify-center">
                  <div className="text-4xl mb-4 opacity-50">📍</div>
                  <h4 className="text-lg font-bold text-slate-900 mb-1">Your area is quiet right now</h4>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">Make sure your profile is fully verified to receive premium job requests instantly.</p>
                  <button onClick={() => showToast("Profile verification coming soon!", "success")} className="bg-emerald-50 text-emerald-700 px-6 py-2 rounded-xl font-bold text-sm hover:bg-emerald-100 transition active:scale-95 cursor-pointer">
                    Verify Profile
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ESTADO VAZIO PARA OUTRAS ABAS */}
          {activeTab !== 'overview' && (
            <div className="bg-white rounded-3xl p-12 shadow-sm border border-slate-100 text-center animate-in fade-in duration-300">
              <div className="text-5xl mb-4 opacity-20">🛠️</div>
              <h3 className="text-xl font-bold text-slate-900 mb-2 capitalize">{activeTab}</h3>
              <p className="text-slate-500">This module is currently under development for the Habitick Beta.</p>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}