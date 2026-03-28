import React, { useState, useEffect } from 'react';
import { Truck, CheckCircle, Database, Trash2, AlertTriangle, ShieldAlert, ArchiveRestore, History, Lock, Activity } from 'lucide-react';

import type { InventoryLot, Silo } from '../App';
import { createInventoryLot, updateInventoryLot } from '../lib/api';

interface AuditLog {
  id: string;
  timestamp: string;
  message: string;
}

interface InventoryProps {
  inventoryLots: InventoryLot[];
  setInventoryLots: React.Dispatch<React.SetStateAction<InventoryLot[]>>;
  silos: Silo[];
}

const Inventory: React.FC<InventoryProps> = ({ inventoryLots, setInventoryLots, silos }) => {
  const [activeTab, setActiveTab] = useState<'main' | 'quarantine'>('main');

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([
    { id: 'LOG-001', timestamp: new Date(Date.now() - 86400000).toLocaleString(), message: 'Lote CAN-TEST-099 borrado definitivamente por Admin_Calidad.' }
  ]);

  const [formData, setFormData] = useState({
    shippingMark: '',
    origin: '',
    moisture: '',
    density: '',
    totalKg: '',
    arrivalNotes: '',
    arrivalDate: new Date().toISOString().split('T')[0],
    exclusiveFor: 'NONE' as 'LIDL' | 'NONE'
  });

  const [lotToDelete, setLotToDelete] = useState<InventoryLot | null>(null);
  const [now, setNow] = useState(Date.now());

  // Timer loop for TTL countdowns
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (activeTab === 'quarantine') {
      interval = setInterval(() => setNow(Date.now()), 10000); // Update every 10s
    }
    return () => clearInterval(interval);
  }, [activeTab]);

  const confirmSoftDelete = () => {
    if (!lotToDelete) return;
    
    // Soft Delete (Mark as INACTIVE + set timestamp)
    const newStatus = 'INACTIVE';
    const deletedTime = Date.now();
    
    // Phase 19: Supabase Sync
    updateInventoryLot(lotToDelete.id, { status: newStatus, deletedAt: deletedTime });

    setInventoryLots(inventoryLots.map(l => l.id === lotToDelete.id ? { ...l, status: newStatus, deletedAt: deletedTime } : l));
    setLotToDelete(null);

    // Notify Data Weaver
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-[#1e222b] border border-blue-500/30 text-white px-6 py-4 rounded-xl shadow-[0_0_30px_rgba(59,130,246,0.2)] z-50 animate-fade-in-up flex items-center space-x-4';
    toast.innerHTML = `
      <div class="bg-blue-500/10 p-2 rounded-lg border border-blue-500/30">
        <svg class="w-6 h-6 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </div>
      <div class="flex flex-col">
        <span class="font-black tracking-widest uppercase text-sm text-blue-400">Data Weaver Notificado</span>
        <span class="text-xs text-gray-400">Gráficos de stock actualizados en tiempo real. Lote ${lotToDelete.id} enviado a Cuarentena.</span>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      if(document.body.contains(toast)) document.body.removeChild(toast);
    }, 4500);
  };

  const handleRestore = (id: string) => {
    updateInventoryLot(id, { status: 'VALIDATED', deletedAt: null as any });
    setInventoryLots(inventoryLots.map(l => l.id === id ? { ...l, status: 'VALIDATED', deletedAt: undefined } : l));
  };

  const handleForceDelete = (lot: InventoryLot) => {
    const pin = window.prompt("⚠️ ACCIÓN DESTRUCTIVA\nIngrese PIN de Administrador (ej: 1234) para forzar el borrado de " + lot.id);
    if (pin === '1234') {
      setInventoryLots(inventoryLots.filter(l => l.id !== lot.id));
      setAuditLogs([
        { id: `LOG-${Math.floor(Math.random()*1000)}`, timestamp: new Date().toLocaleString(), message: `Lote ${lot.id} borrado de forma FORZADA por Admin (PIN) el ${new Date().toLocaleDateString()}.` },
        ...auditLogs
      ]);
    } else if (pin !== null) {
      alert("Acceso Denegado. PIN Incorrecto.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Generate a collision-resistant ID to prevent Supabase PK constraints
    const cleanMark = formData.shippingMark.trim().replace(/\s+/g, '-').toUpperCase();
    const uniqueSuffix = Date.now().toString().slice(-4);
    const generatedId = cleanMark ? `${cleanMark}-${uniqueSuffix}` : `LOTE-${String(inventoryLots.length + 1).padStart(3, '0')}-${uniqueSuffix}`;

    const newLot: InventoryLot = {
      id: generatedId,
      shippingMark: formData.shippingMark,
      arrivalNotes: formData.arrivalNotes,
      origin: formData.origin,
      moisture: parseFloat(formData.moisture),
      density: parseFloat(formData.density),
      arrivalDate: formData.arrivalDate,
      status: (parseFloat(formData.moisture) >= 9 && parseFloat(formData.moisture) <= 12.5) ? 'VALIDATED' : 'REJECTED',
      stock_kg: parseFloat(formData.totalKg) || 0,
      originalStock_kg: parseFloat(formData.totalKg) || 0,
      price_per_kg: 5.0, 
      exclusiveFor: formData.exclusiveFor
    };
    
    const result = await createInventoryLot(newLot);
    if (!result.success) {
        alert("Error al registrar el lote en la base de datos: " + result.error);
        return;
    }

    setInventoryLots([newLot, ...inventoryLots]);
    setFormData({ shippingMark: '', arrivalNotes: '', origin: '', moisture: '', density: '', totalKg: '', arrivalDate: new Date().toISOString().split('T')[0], exclusiveFor: 'NONE' });
  };

  const getTTLString = (deletedAt: number) => {
    const ms24h = 24 * 60 * 60 * 1000;
    const expiresAt = deletedAt + ms24h;
    const diff = expiresAt - now;
    if (diff <= 0) return "Expirado";
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${h}h ${m}m`;
  };

  const activeLots = inventoryLots.filter(l => l.status !== 'INACTIVE');
  const inactiveLots = inventoryLots.filter(l => l.status === 'INACTIVE');

  return (
    <div className="flex flex-col h-full w-full bg-dashboard-bg text-gray-200">
      
      {/* Top Banner with Tabs */}
      <div className="bg-dashboard-panel border-b border-dashboard-border px-6 py-4 flex items-center justify-between shadow-sm z-20">
        <div className="flex items-center space-x-6">
          <div className={`p-3 rounded-xl border transition-colors ${activeTab === 'quarantine' ? 'bg-red-500/10 border-red-500/30' : 'bg-coffee-info/20 border-coffee-info/30'}`}>
            {activeTab === 'quarantine' ? <ShieldAlert className="w-6 h-6 text-red-400" /> : <Truck className="w-6 h-6 text-coffee-info" />}
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase flex items-center">
              Inventario & Origen <span className="text-gray-500 mx-2">/</span> {activeTab === 'main' ? <span className="text-coffee-light">Activos</span> : <span className="text-red-400">Cuarentena</span>}
            </h1>
            <p className="text-sm text-gray-400 font-bold tracking-widest uppercase">
              {activeTab === 'main' ? 'Recepción de café verde y validación de línea base' : 'Sub-agente de recuperación y logs de auditoría'}
            </p>
          </div>
        </div>

        {/* Tab Routing */}
        <div className="flex bg-[#14161a] border border-dashboard-border rounded-lg p-1 space-x-1">
          <button 
            onClick={() => setActiveTab('main')}
            className={`px-6 py-2 rounded-md font-bold text-sm tracking-widest uppercase transition-all ${activeTab === 'main' ? 'bg-[#1e222b] text-white shadow' : 'text-gray-500 hover:text-white'}`}
          >
            Base Activa
          </button>
          <button 
            onClick={() => setActiveTab('quarantine')}
            className={`px-6 py-2 rounded-md font-bold text-sm tracking-widest uppercase transition-all flex items-center ${activeTab === 'quarantine' ? 'bg-red-500/10 text-red-400 shadow' : 'text-gray-500 hover:text-red-400'}`}
          >
            Cuarentena <span className="ml-2 bg-red-500/20 text-red-400 py-0.5 px-2 rounded-full text-[10px]">{inactiveLots.length}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto relative">
        
        {/* TAB: MAIN ACTIVE INVENTORY */}
        {activeTab === 'main' && (
          <div className="grid grid-cols-12 gap-6 animate-fade-in">
            {/* Silo Low Capacity Alerts (Phase 14) */}
            <div className="col-span-12">
              {silos.filter(s => s.currentKg > 0 && (s.currentKg / s.maxKg) < 0.2).map(s => (
                <div key={s.id} className="bg-orange-500/10 border border-orange-500/50 p-4 rounded-xl flex items-center justify-between shadow-lg shadow-orange-500/5 mb-2 animate-pulse">
                  <div className="flex items-center space-x-4">
                    <div className="bg-orange-500/20 p-2 rounded-lg">
                      <AlertTriangle className="w-6 h-6 text-orange-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-orange-400 uppercase tracking-widest">ALERTA PISO SUPERIOR: SILO {s.id} AL {(s.currentKg / s.maxKg * 100).toFixed(0)}%</h3>
                      <p className="text-xs text-gray-300 mt-1">
                        El volumen de <span className="font-bold text-white">{s.origin}</span> ha caído a {s.currentKg}kg.
                        Realice una transferencia en Gestión de Silos para evitar paradas mecánicas.
                      </p>
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-[#1e222b] hover:bg-white/10 rounded-lg text-xs font-bold text-gray-300 uppercase tracking-widest border border-dashboard-border transition-colors">
                    Revisar Lotes
                  </button>
                </div>
              ))}
            </div>

            {/* Registration Form */}
            <div className="col-span-12 lg:col-span-4 flex flex-col space-y-4">
              <div className="bg-dashboard-panel border border-dashboard-border rounded-xl p-6 shadow-lg">
                <h2 className="text-lg font-bold text-white mb-6 uppercase tracking-widest flex items-center">
                  <Database className="w-5 h-5 mr-3 text-coffee-light" />
                  Ingresar Nuevo Lote
                </h2>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Lote Importación (Shipping Mark)</label>
                      <input 
                        type="text" required
                        className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg p-3 text-white focus:outline-none focus:border-coffee-light transition-colors font-mono uppercase"
                        placeholder="BR-NY2-404"
                        value={formData.shippingMark}
                        onChange={e => setFormData({...formData, shippingMark: e.target.value.toUpperCase()})}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Origen</label>
                      <input 
                        type="text" required
                        className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg p-3 text-white focus:outline-none focus:border-coffee-light transition-colors"
                        placeholder="Ej. Brasil Cerrado"
                        value={formData.origin}
                        onChange={e => setFormData({...formData, origin: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Humedad In. (%)</label>
                      <input 
                        type="number" step="0.1" required
                        className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg p-3 text-white focus:outline-none focus:border-coffee-light transition-colors font-mono"
                        placeholder="10.5"
                        value={formData.moisture}
                        onChange={e => setFormData({...formData, moisture: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Densidad (g/L)</label>
                      <input 
                        type="number" required
                        className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg p-3 text-white focus:outline-none focus:border-coffee-light transition-colors font-mono"
                        placeholder="800"
                        value={formData.density}
                        onChange={e => setFormData({...formData, density: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Kg Totales (Recepción)</label>
                    <input 
                      type="number" required
                      className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg p-3 text-coffee-light font-black focus:outline-none focus:border-coffee-light transition-colors font-mono"
                      placeholder="5000"
                      value={formData.totalKg}
                      onChange={e => setFormData({...formData, totalKg: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Notas Arribo (Cupping)</label>
                    <textarea 
                      rows={2}
                      className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg p-3 text-gray-300 focus:outline-none focus:border-coffee-light transition-colors text-sm"
                      placeholder="Ej. Notas maderables..."
                      value={formData.arrivalNotes}
                      onChange={e => setFormData({...formData, arrivalNotes: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Fecha de Llegada</label>
                    <input 
                      type="date" required
                      className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg p-3 text-gray-300 focus:outline-none focus:border-coffee-light transition-colors font-mono"
                      value={formData.arrivalDate}
                      onChange={e => setFormData({...formData, arrivalDate: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="flex items-center space-x-3 bg-[#1a1d24] p-3 rounded-lg border border-dashboard-border cursor-pointer hover:border-coffee-accent/50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={formData.exclusiveFor === 'LIDL'}
                        onChange={e => setFormData({...formData, exclusiveFor: e.target.checked ? 'LIDL' : 'NONE'})}
                        className="w-4 h-4 text-coffee-accent bg-[#1e222b] border-gray-600 rounded focus:ring-coffee-accent"
                      />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center">
                        <Lock className="w-3 h-3 mr-2 text-coffee-accent" /> Reserva Contrato (Lidl)
                      </span>
                    </label>
                  </div>
                  <button type="submit" className="w-full mt-6 bg-coffee-accent hover:bg-coffee-light text-white font-black uppercase tracking-widest py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(217,119,6,0.3)] active:scale-95">
                    Registrar Métrica
                  </button>
                </form>
              </div>
            </div>

            {/* Lots Database Table */}
            <div className="col-span-12 lg:col-span-8 bg-dashboard-panel border border-dashboard-border rounded-xl shadow-lg flex flex-col">
              <div className="px-6 py-5 border-b border-dashboard-border bg-gradient-to-r from-[#1e222b] to-transparent flex justify-between items-center">
                <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center">
                  Base de Datos Activa
                </h2>
                
                {/* Burn Rate Predictor Alert */}
                <div className="flex items-center space-x-2 bg-orange-500/10 border border-orange-500/30 px-3 py-1.5 rounded-lg animate-pulse">
                  <Activity className="w-4 h-4 text-orange-400" />
                  <div className="text-[10px] text-orange-400 font-bold tracking-wide">
                     <span className="uppercase font-black text-orange-500">Alerta de Consumo:</span> 'Brasil Cerrado' subió 20% vel. de tueste. 
                     Stock actual se agotará en <span className="underline decoration-orange-500 text-white font-mono">15 DÍAS</span> (Previsto: 20 d).
                  </div>
                </div>
              </div>
              <div className="p-0 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#14161a]">
                    <tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-dashboard-border">
                      <th className="p-4 font-black">Lote Int.</th>
                      <th className="p-4 font-black">Ship / Notas</th>
                      <th className="p-4 font-black">Origen / Reserva</th>
                      <th className="p-4 font-black">Stock / Merma</th>
                      <th className="p-4 font-black">Ingreso (Frescura)</th>
                      <th className="p-4 font-black text-right">Validación</th>
                      <th className="p-4 font-black text-center">Gestión</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashboard-border">
                    {activeLots.map((lot) => {
                      const arrival = new Date(lot.arrivalDate);
                      const diffMonths = (Date.now() - arrival.getTime()) / (1000 * 60 * 60 * 24 * 30);
                      const isOld = diffMonths > 6;
                      
                      return (
                      <tr key={lot.id} className="hover:bg-[#1a1d24] transition-colors group">
                        <td className="p-4">
                          <div className="font-mono text-sm font-bold text-coffee-light">{lot.id}</div>
                          <button onClick={() => alert(`🖨️ Mandando señal de impresión de Etiqueta QR para: ${lot.id}`)} className="text-[9px] mt-1 uppercase tracking-widest bg-[#1e222b] px-2 py-0.5 rounded text-gray-400 hover:text-white border border-dashboard-border">Imprimir QR</button>
                        </td>
                        <td className="p-4">
                          <div className="font-mono text-xs font-bold text-gray-300">{lot.shippingMark || 'N/A'}</div>
                          {lot.arrivalNotes && <div className="text-[10px] text-gray-500 italic max-w-xs truncate">{lot.arrivalNotes}</div>}
                        </td>
                        <td className="p-4 font-medium text-white flex flex-col items-start">
                          <span className="mb-1">{lot.origin}</span>
                          {lot.exclusiveFor === 'LIDL' && <span className="bg-[#1a1d24] text-coffee-accent/80 text-[9px] px-2 py-0.5 rounded border border-coffee-accent/20 flex items-center uppercase tracking-widest font-black"><Lock className="w-2.5 h-2.5 mr-1"/> Exclusivo LIDL</span>}
                        </td>
                        <td className="p-4">
                          <div className="text-gray-200 font-mono font-bold">{lot.stock_kg.toFixed(1)} <span className="text-[10px] text-gray-500 font-sans">kg</span></div>
                          {lot.originalStock_kg && lot.originalStock_kg > lot.stock_kg && lot.status === 'VALIDATED' && (
                             <div className="text-[10px] text-orange-400 font-mono mt-0.5">-{(lot.originalStock_kg - lot.stock_kg).toFixed(1)}kg Merma</div>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="text-gray-400 text-xs font-mono">{lot.arrivalDate}</div>
                          {isOld ? (
                            <div className="text-[9px] mt-1 font-black text-red-500 uppercase tracking-widest bg-red-500/10 inline-block px-1.5 py-0.5 rounded border border-red-500/30">Semáforo: Viejo</div>
                          ) : (
                            <div className="text-[9px] mt-1 font-black text-green-500 uppercase tracking-widest">OK</div>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          {lot.status === 'VALIDATED' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded bg-green-500/10 text-green-400 font-bold text-[10px] uppercase tracking-widest border border-green-500/20">
                              <CheckCircle className="w-3 h-3 mr-1" /> Aprobado
                            </span>
                          ) : lot.status === 'REJECTED' ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded bg-red-500/10 text-red-400 font-bold text-[10px] uppercase tracking-widest border border-red-500/20">
                              Rechazado
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded bg-gray-500/10 text-gray-400 font-bold text-[10px] uppercase tracking-widest border border-gray-500/20">
                              Pendiente
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center space-x-2">
                             <button 
                               onClick={() => {
                                  const newVal = window.prompt(`Registrar Merma por Deshidratación (Kg actual de ${lot.id})`, lot.stock_kg.toString());
                                  if (newVal && !isNaN(parseFloat(newVal))) {
                                     setInventoryLots(inventoryLots.map(l => l.id === lot.id ? {...l, stock_kg: parseFloat(newVal)} : l));
                                  }
                               }}
                               className="text-orange-400/70 hover:text-orange-400 transition-all p-1.5 rounded-lg hover:bg-orange-500/10 text-[10px] uppercase font-bold tracking-widest border border-transparent hover:border-orange-500/30"
                               title="Ajuste de Merma en Almacén"
                             >
                               Merma
                             </button>
                             <button 
                               onClick={() => setLotToDelete(lot)}
                               className="text-gray-500 hover:text-red-400 transition-all p-1.5 rounded-lg hover:bg-red-500/10"
                               title="Eliminar Lote de Inventario"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {activeLots.length === 0 && (
                       <tr><td colSpan={7} className="p-8 text-center text-gray-500 uppercase tracking-widest text-xs font-bold">No hay lotes activos.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: QUARANTINE ZONE */}
        {activeTab === 'quarantine' && (
          <div className="flex flex-col space-y-6 animate-fade-in relative z-10 w-full max-w-6xl mx-auto">
             
             {/* Red Watermark BG */}
             <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center opacity-[0.02]">
                <ShieldAlert className="w-[800px] h-[800px] text-red-500" />
             </div>

             <div className="bg-[#14161a] border border-red-500/30 rounded-2xl shadow-[0_0_40px_rgba(239,68,68,0.05)] overflow-hidden relative z-10">
                <div className="px-6 py-5 border-b border-red-500/20 bg-red-500/5 flex justify-between items-center">
                  <h2 className="text-lg font-black uppercase tracking-widest text-red-400 flex items-center">
                    <ArchiveRestore className="w-5 h-5 mr-3" /> Lotes En Cuarentena (24H TTL)
                  </h2>
                </div>
                
                <table className="w-full text-left border-collapse">
                  <thead className="bg-[#1a1d24]">
                    <tr className="text-[10px] uppercase tracking-widest text-gray-500 border-b border-dashboard-border">
                      <th className="p-4 font-black">Lote ID</th>
                      <th className="p-4 font-black">Origen</th>
                      <th className="p-4 font-black">Estado</th>
                      <th className="p-4 font-black">Destrucción Automática</th>
                      <th className="p-4 font-black text-right">Accidentales / Admin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashboard-border">
                    {inactiveLots.map((lot) => (
                      <tr key={lot.id} className="hover:bg-[#1a1d24] transition-colors">
                        <td className="p-4 font-mono text-sm font-bold text-gray-400 line-through">{lot.id}</td>
                        <td className="p-4 font-medium text-gray-500 flex items-center">
                          {lot.origin}
                          {lot.exclusiveFor === 'LIDL' && <span title="Reserva Publ"><Lock className="w-3 h-3 ml-2 text-gray-600" /></span>}
                        </td>
                        <td className="p-4">
                           <span className="bg-[#14161a] border border-dashboard-border text-gray-600 font-bold text-[10px] uppercase tracking-widest px-2 py-1 rounded">Hidden</span>
                        </td>
                        <td className="p-4 font-mono text-xs font-bold">
                           {lot.deletedAt ? (
                             <span className="text-orange-400 bg-orange-400/10 px-2 py-1 rounded border border-orange-400/20">
                               💣 En {getTTLString(lot.deletedAt)}
                             </span>
                           ) : '--'}
                        </td>
                        <td className="p-4 text-right flex justify-end space-x-3">
                           <button onClick={() => handleRestore(lot.id)} className="flex items-center bg-green-500/10 hover:bg-green-500/20 text-green-400 font-black tracking-widest uppercase text-[10px] px-4 py-2 rounded-lg border border-green-500/30 transition-all shadow-[0_0_15px_rgba(34,197,94,0.1)] hover:scale-105">
                             <CheckCircle className="w-3 h-3 mr-2" /> Restaurar
                           </button>
                           <button onClick={() => handleForceDelete(lot)} className="flex items-center bg-[#14161a] hover:bg-red-500/20 text-gray-500 hover:text-red-400 font-black tracking-widest uppercase text-[10px] px-3 py-2 rounded-lg border border-dashboard-border hover:border-red-500/50 transition-all">
                             <Lock className="w-3 h-3 mr-2" /> Forzar
                           </button>
                        </td>
                      </tr>
                    ))}
                    {inactiveLots.length === 0 && (
                       <tr><td colSpan={5} className="p-12 text-center text-gray-500 uppercase tracking-widest text-sm font-bold">La zona de cuarentena está vacía.</td></tr>
                    )}
                  </tbody>
                </table>
             </div>

             {/* Audit Log Panel */}
             <div className="bg-dashboard-panel border border-dashboard-border rounded-xl shadow-lg relative z-10 overflow-hidden mt-8">
               <div className="px-6 py-4 border-b border-dashboard-border bg-[#1a1d24] flex items-center">
                 <History className="w-4 h-4 text-gray-400 mr-2" />
                 <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Log de Auditoría (Trazabilidad)</h3>
               </div>
               <div className="p-4 space-y-2 max-h-64 overflow-y-auto">
                 {auditLogs.map((log) => (
                   <div key={log.id} className="flex flex-col sm:flex-row sm:items-center text-xs font-mono bg-[#14161a] p-3 rounded-lg border border-dashboard-border">
                     <span className="text-gray-500 w-40 shrink-0 mb-1 sm:mb-0">[{log.timestamp}]</span>
                     <span className="text-gray-300 flex-1">{log.message}</span>
                     <span className="text-[10px] font-black text-gray-600 ml-4 shrink-0 uppercase tracking-widest">{log.id}</span>
                   </div>
                 ))}
               </div>
             </div>
          </div>
        )}

      </div>
      
      {/* Verify Deletion Modal (Main Tab) */}
      {lotToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#14161a] border border-red-500/40 rounded-3xl p-8 max-w-xl w-full shadow-[0_0_50px_rgba(239,68,68,0.15)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
            
            <div className="flex items-start mb-6">
              <div className="bg-red-500/10 p-4 rounded-2xl mr-5 border border-red-500/20 shrink-0">
                <AlertTriangle className="w-10 h-10 text-red-500" />
              </div>
              <div>
                <h3 className="text-3xl font-black uppercase tracking-widest text-white mb-2 leading-tight">Enviar a<br/>Cuarentena</h3>
                <p className="text-gray-400 font-mono text-sm">{lotToDelete.id} — {lotToDelete.origin}</p>
              </div>
            </div>
            
            <div className="bg-[#1e222b] rounded-xl p-5 mb-8 border border-dashboard-border">
               {lotToDelete.id === 'CAN-LIDL-001' || lotToDelete.status === 'VALIDATED' ? (
                  <p className="text-red-400 font-bold leading-relaxed text-sm">
                    ⚠️ ALERTA CRÍTICA DE TRAZABILIDAD: Este lote ya tiene procesos de tueste vinculados. Si lo ocultas, aislarás el historial de trazabilidad (Orígenes &rarr; Calidad Laboratorio). Dispondremos de 24h para restaurarlo. ¿Deseas continuar bajo tu responsabilidad?
                  </p>
               ) : (
                  <p className="text-gray-300 leading-relaxed text-sm">
                    ¿Estás seguro de que deseas enviar el lote <span className="font-bold text-white">[{lotToDelete.id}]</span> introducido por error a la papelera? Esta acción aislará el lote por 24 horas antes del borrado definitivo.
                  </p>
               )}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => setLotToDelete(null)}
                className="flex-[2] bg-[#1e222b] hover:bg-dashboard-border text-white font-black uppercase tracking-widest py-5 px-6 rounded-2xl border-2 border-transparent hover:border-gray-500 transition-all text-xl shadow-lg"
              >
                Cancelar y Mantener
              </button>
              <button 
                onClick={confirmSoftDelete}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold uppercase tracking-widest py-5 px-4 rounded-2xl shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all active:scale-95 flex items-center justify-center text-sm"
              >
                <Trash2 className="w-5 h-5 mr-2" />
                Cuarentena
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
