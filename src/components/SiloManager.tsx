import React, { useState } from 'react';
import { Database, AlertTriangle, ArrowRight, Truck, Calendar, AlertCircle, Timer } from 'lucide-react';
import type { Silo, InventoryLot, DailyRoastOrder } from '../App';
import { updateSilo, updateInventoryLot } from '../lib/api';

interface SiloManagerProps {
  silos: Silo[];
  setSilos: React.Dispatch<React.SetStateAction<Silo[]>>;
  inventoryLots: InventoryLot[];
  setInventoryLots: React.Dispatch<React.SetStateAction<InventoryLot[]>>;
  roastOrders: DailyRoastOrder[];
}

const SiloManager: React.FC<SiloManagerProps> = ({ silos, setSilos, inventoryLots, setInventoryLots, roastOrders }) => {
  const validLots = inventoryLots.filter(l => l.status === 'VALIDATED' && l.stock_kg > 0);

  const [selectedLotId, setSelectedLotId] = useState<string>('');
  const [selectedSiloId, setSelectedSiloId] = useState<number>(0);
  const [transferKg, setTransferKg] = useState<number>(0);

  const selectedLot = validLots.find(l => l.id === selectedLotId);
  const targetSilo = silos.find(s => s.id === selectedSiloId);

  // Validation Logic
  const originMismatch = targetSilo && targetSilo.currentKg > 0 && targetSilo.origin !== selectedLot?.origin;
  const overflow = targetSilo && (targetSilo.currentKg + transferKg) > targetSilo.maxKg;
  const insufficientStock = selectedLot && transferKg > selectedLot.stock_kg;
  
  // Phase 11: Demand Forecasting Logic
  const calculateDemand = () => {
    const demand: Record<string, number> = {};
    roastOrders
      .filter(o => o.status === 'PLANNED')
      .forEach(order => {
        order.tasks.forEach(task => {
          if (task.type === 'ROAST') {
            const origin = task.origins[0];
            demand[origin] = (demand[origin] || 0) + task.targetWeightKg;
          }
        });
      });
    return demand;
  };

  const totalDemand = calculateDemand();
  const originsInDemand = Object.keys(totalDemand);

  const canTransfer = selectedLot && targetSilo && transferKg > 0 && !originMismatch && !overflow && !insufficientStock;

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canTransfer) return;

    // Persist to Supabase Phase 18
    const newSiloKg = targetSilo.currentKg + transferKg;
    const newLotKg = selectedLot.stock_kg - transferKg;

    const okSilo = await updateSilo(selectedSiloId, { 
      lotId: selectedLot.id, 
      origin: selectedLot.origin, 
      moisture: selectedLot.moisture || null, 
      currentKg: newSiloKg 
    });
    
    const okLot = await updateInventoryLot(selectedLot.id, { stock_kg: newLotKg });

    if (!okSilo || !okLot) {
      alert("Error al sincronizar con la base de datos.");
      return;
    }

    setSilos(prev => prev.map(s => {
      if (s.id === selectedSiloId) {
        return {
          ...s,
          lotId: selectedLot.id,
          origin: selectedLot.origin,
          moisture: selectedLot.moisture,
          currentKg: newSiloKg
        };
      }
      return s;
    }));

    // Deduct stock from the global inventory payload (Phase 13)
    setInventoryLots(prev => prev.map(l => {
      if (l.id === selectedLot.id) {
        return {
          ...l,
          stock_kg: l.stock_kg - transferKg
        };
      }
      return l;
    }));

    // Reset form
    setTransferKg(0);
    
    // Simulate UI Toast
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-green-500/90 text-white px-6 py-4 rounded-xl font-bold shadow-[0_0_30px_rgba(34,197,94,0.3)] z-50 animate-bounce flex flex-col space-y-1';
    toast.innerHTML = `
      <span class="flex items-center">🛢️ Silo ${selectedSiloId} Cargado: +${transferKg}kg de ${selectedLot.origin}</span>
      <span class="text-xs bg-black/20 p-2 rounded block mt-1">Almacén: Stock de lote ${selectedLot.id} reducido a ${selectedLot.stock_kg - transferKg}kg.</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => document.body.removeChild(toast), 5000);
  };

  return (
    <div className="flex flex-col h-full w-full bg-dashboard-bg text-gray-200 overflow-y-auto">
      
      {/* Top Banner */}
      <div className="bg-dashboard-panel border-b border-dashboard-border px-10 py-8 shadow-sm flex flex-col justify-center relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
        <h1 className="text-3xl font-black tracking-tight text-white mb-2 uppercase flex items-center">
           <Database className="w-8 h-8 mr-3 text-blue-400" /> Centro de Control de Silos
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl">
          Sincronización Piso Inferior (Almacén) ➔ Piso Superior (Planta de Tueste). Enruta café verde validado a depósitos de alta capacidad de forma segura.
        </p>
      </div>

      <div className="p-10 flex-1 relative z-10 mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left Column: Módulo de Carga */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-8 shadow-2xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl transform translate-x-10 -translate-y-10"></div>
             
             <h2 className="text-xl font-bold mb-6 text-white flex items-center uppercase tracking-widest relative z-10 border-b border-dashboard-border pb-4">
               <Truck className="w-6 h-6 mr-3 text-blue-400" />
               Módulo de Carga
             </h2>


             <form onSubmit={handleTransfer} className="space-y-6 relative z-10">
               
               {/* Lote FIFO Selector */}
               <div>
                 <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">1. Lote Aprobado (Origen)</label>
                 <select 
                   className="w-full bg-[#14161a] border border-dashboard-border rounded-xl p-4 text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none font-medium"
                   value={selectedLotId}
                   onChange={e => setSelectedLotId(e.target.value)}
                   required
                 >
                   <option value="" disabled>Selecciona Lote en Inventario</option>
                   {validLots.map(l => (
                     <option key={l.id} value={l.id}>{l.origin} — {l.id} ({l.stock_kg}kg disp)</option>
                   ))}
                 </select>
                 {selectedLot && (
                   <div className="mt-2 text-[10px] font-mono text-blue-300 bg-blue-500/10 p-2 rounded-lg border border-blue-500/20 flex justify-between">
                     <span>H₂O: {selectedLot.moisture}%</span>
                     <span>Densidad: {selectedLot.density}g/L</span>
                   </div>
                 )}
               </div>

               {/* Target Silo Selector */}
               <div>
                 <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">2. Destino (Silo)</label>
                 <div className="grid grid-cols-5 gap-2">
                   {silos.map(s => {
                     const isAvailable = s.currentKg === 0 || s.origin === selectedLot?.origin;
                     const isFull = s.currentKg >= s.maxKg;
                     return (
                       <button
                         type="button"
                         key={s.id}
                         disabled={!isAvailable || isFull}
                         onClick={() => setSelectedSiloId(s.id)}
                         className={`py-3 rounded-lg font-black text-sm transition-all border ${
                           selectedSiloId === s.id 
                             ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' 
                             : (!isAvailable || isFull)
                               ? 'bg-dashboard-bg border-transparent text-gray-600 opacity-50 cursor-not-allowed'
                               : 'bg-[#14161a] border-dashboard-border text-gray-400 hover:border-blue-500/50 hover:text-white'
                         }`}
                       >
                         {s.id}
                       </button>
                     )
                   })}
                 </div>
               </div>

               {/* Kilos a transferir */}
               <div>
                 <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">3. Volumen a Subir (kg)</label>
                 <div className="flex bg-[#14161a] border border-dashboard-border rounded-xl px-4 py-2 focus-within:border-blue-500 transition-colors">
                   <input 
                     type="number" min="1" max="4000"
                     className="w-full bg-transparent text-2xl font-black text-white focus:outline-none"
                     value={transferKg || ''}
                     onChange={e => setTransferKg(parseInt(e.target.value) || 0)}
                     required
                   />
                   <span className="text-gray-500 font-black text-xl flex items-center ml-2">KG</span>
                 </div>
               </div>

               {/* Safety Alerts */}
               <div className="space-y-2">
                 {originMismatch && (
                   <div className="flex items-start text-[11px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                     <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" /> No se permiten diferentes orígenes en un mismo silo. Rastreabilidad comprometida.
                   </div>
                 )}
                 {overflow && (
                   <div className="flex items-start text-[11px] font-black uppercase tracking-widest text-orange-500 bg-orange-500/10 p-3 rounded-lg border border-orange-500/20">
                     <AlertTriangle className="w-4 h-4 mr-2 flex-shrink-0" /> Excede la capacidad máxima de ${targetSilo?.maxKg}kg.
                   </div>
                 )}
               </div>

               {/* Action Button */}
               <button 
                 type="submit" 
                 disabled={!canTransfer}
                 className={`w-full font-black uppercase tracking-widest py-5 rounded-xl transition-all shadow-xl flex items-center justify-center mt-4
                   ${canTransfer
                     ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]' 
                     : 'bg-[#14161a] border border-dashboard-border text-gray-600 cursor-not-allowed hidden'}`}
               >
                 Autorizar Carga <ArrowRight className="w-5 h-5 ml-2" />
               </button>
             </form>
          </div>
        </div>

        {/* Right Column: Dashboard Panel */}
        <div className="lg:col-span-8 flex flex-col space-y-6">
           {/* Summary Stats */}
           <div className="grid grid-cols-3 gap-6">
             <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 flex flex-col">
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Volumen Total en Silos</span>
               <span className="text-3xl font-black text-white">{silos.reduce((sum, s) => sum + s.currentKg, 0).toLocaleString()} <span className="text-sm text-gray-500">KG</span></span>
             </div>
             <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 flex flex-col">
               <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Capacidad Máxima</span>
               <span className="text-3xl font-black text-blue-400">40,000 <span className="text-sm text-gray-500">KG</span></span>
             </div>
             <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Rastreo Activo</span>
                  <span className="text-xl font-black text-white">{silos.filter(s => s.currentKg > 0).length} Lotes</span>
                </div>
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <Database className="w-6 h-6 text-blue-400" />
                </div>
             </div>
           </div>

           {/* Silo Grid */}
           <div className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-8 flex-1">
              <div className="flex justify-between items-center mb-8 border-b border-dashboard-border pb-4">
                 <h3 className="text-lg font-black uppercase tracking-widest text-white flex items-center">
                    <Database className="w-5 h-5 mr-3 text-coffee-light" />
                    Telemetría de Abastecimiento Activo
                 </h3>
                 <span className="px-3 py-1 bg-green-500/20 text-green-400 text-[10px] font-black uppercase tracking-widest rounded border border-green-500/30 flex items-center">
                   <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse mr-2"></div> SINC
                 </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-y-12 gap-x-6">
                 {silos.map(silo => {
                   const fillPct = (silo.currentKg / silo.maxKg) * 100;
                   const isEmpty = silo.currentKg === 0;
                   
                   return (
                     <div key={silo.id} className="flex flex-col items-center group relative cursor-pointer">
                        {/* Status Label Overlay on hover maybe */}
                        <div className="mb-2 text-center h-8 flex flex-col justify-end">
                           <span className="text-[10px] uppercase font-black tracking-widest text-gray-500">Silo {silo.id}</span>
                        </div>
                        
                        {/* Silo SVG/Container */}
                        <div className="w-24 h-48 bg-[#14161a] rounded-t-full rounded-b-3xl border-2 border-dashboard-border relative overflow-hidden shadow-inner group-hover:border-blue-500/50 transition-colors">
                           {/* Fill Component */}
                           <div 
                             className={`absolute bottom-0 w-full rounded-b-3xl transition-all duration-1000 ${isEmpty ? 'bg-transparent' : 'bg-gradient-to-t from-coffee-accent to-[#b45309]'}`}
                             style={{ height: `${Math.max(fillPct, 0)}%` }}
                           >
                             {!isEmpty && <div className="absolute top-0 w-full h-1 bg-white/20"></div>}
                           </div>
                           
                           {/* Demand Indicator Overlay */}
                            {silo.origin && totalDemand[silo.origin] && !isEmpty && (
                               <div 
                                 className="absolute bottom-0 w-full border-t-2 border-dashed border-white/40 bg-white/5 pointer-events-none"
                                 style={{ height: `${Math.max((totalDemand[silo.origin] / silo.maxKg) * 100, 0)}%`, opacity: 0.4 }}
                                 title={`Demanda Planificada: ${totalDemand[silo.origin]}kg`}
                               ></div>
                            )}

                           {/* Ticks */}
                           <div className="absolute inset-y-0 left-2 w-2 flex flex-col justify-between py-6 opacity-30">
                              <div className="w-full h-px bg-white"></div>
                              <div className="w-1/2 h-px bg-white"></div>
                              <div className="w-full h-px bg-white"></div>
                              <div className="w-1/2 h-px bg-white"></div>
                              <div className="w-full h-px bg-white"></div>
                           </div>
                        </div>

                        {/* Silo Metadata */}
                        <div className="mt-4 w-full flex flex-col items-center text-center">
                           <div className={`text-xl font-black ${isEmpty ? 'text-gray-600' : 'text-white'} transition-colors leading-none mb-1`}>
                             {silo.currentKg.toLocaleString()}
                           </div>
                           <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                             {isEmpty ? 'Vacío' : 'KG'}
                           </div>

                           {!isEmpty && (
                             <div className="mt-3 bg-[#14161a] w-full p-2 rounded-lg border border-dashboard-border relative">
                               <div className="text-[10px] font-bold text-coffee-light uppercase truncate mb-1 border-b border-dashboard-border pb-1" title={silo.origin || ''}>
                                 {silo.origin}
                               </div>
                               <div className="flex justify-center space-x-2 text-[9px] text-gray-400 font-mono">
                                  <span>H₂O: {silo.moisture}%</span>
                               </div>
                               
                                {/* Insufficient Alert */}
                                {silo.origin && totalDemand[silo.origin] > silo.currentKg && (
                                   <div className="absolute -top-1 -right-1">
                                      <div className="w-4 h-4 bg-red-600 rounded-full flex items-center justify-center animate-pulse border border-white/20 shadow-lg">
                                         <AlertTriangle className="w-2.5 h-2.5 text-white" />
                                      </div>
                                   </div>
                                )}

                                {/* Stale Alert (5 days) */}
                                {silo.lastFillDate && (Date.now() - new Date(silo.lastFillDate).getTime() > 5 * 24 * 60 * 60 * 1000) && (
                                   <div className="absolute -top-1 -left-1">
                                      <div className="w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center border border-white/20 shadow-lg" title="Café Estancado (+5 días)">
                                         <Timer className="w-2.5 h-2.5 text-white" />
                                      </div>
                                   </div>
                                )}
                              </div>
                            )}
                        </div>
                     </div>
                   );
                 })}
              </div>
           </div>
        </div>

      </div>
      
      {/* Bottom Alert / Task System (Phase 11) */}
      <div className="lg:col-span-12 mt-4 px-10 pb-10">
         <div className="bg-[#14161a] border border-blue-500/20 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>
            
            <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-8 w-full">
               <div className="bg-blue-600 p-6 rounded-2xl shadow-lg ring-4 ring-blue-500/20 shrink-0">
                  <Calendar className="w-10 h-10 text-white" />
               </div>
               <div className="flex-1">
                  <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Tareas Diarias: Proyección de Carga</h2>
                  <p className="text-gray-400 font-bold">Basado en lo planificado en el <span className="text-blue-400">Hub de Producción</span> para las próximas 24-48h.</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                     {originsInDemand.map(origin => {
                        const demand = totalDemand[origin];
                        const stockInSilos = silos
                          .filter(s => s.origin === origin)
                          .reduce((sum, s) => sum + s.currentKg, 0);
                        const gap = demand - stockInSilos;
                        const isShort = gap > 0;

                        return (
                           <div key={origin} className={`p-4 rounded-xl border flex flex-col ${isShort ? 'bg-red-500/10 border-red-500/30' : 'bg-[#1e222b] border-dashboard-border'}`}>
                              <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">{origin}</span>
                              <div className="flex justify-between items-end">
                                 <div className="flex flex-col">
                                    <span className="text-xs font-bold text-gray-400">Necesario: <span className="text-white">{demand} kg</span></span>
                                    <span className="text-xs font-bold text-gray-400">Stock Actual: <span className="text-white">{stockInSilos} kg</span></span>
                                 </div>
                                 {isShort ? (
                                    <div className="text-right">
                                       <span className="text-red-500 font-black text-xl leading-none">+{gap} kg</span>
                                       <span className="block text-[8px] font-black text-red-400 uppercase tracking-tighter mt-1">RECARGAR SILO</span>
                                    </div>
                                 ) : (
                                    <div className="text-right">
                                       <span className="text-green-500 font-black text-xl leading-none">OK</span>
                                       <span className="block text-[8px] font-black text-green-400 uppercase tracking-tighter mt-1">CUBIERTO</span>
                                    </div>
                                 )}
                              </div>
                           </div>
                        );
                     })}
                     {originsInDemand.length === 0 && (
                        <div className="col-span-3 border-2 border-dashed border-dashboard-border rounded-xl p-8 flex items-center justify-center opacity-40">
                           <span className="text-xs font-bold uppercase tracking-widest text-gray-500">No hay demanda planificada hoy</span>
                        </div>
                     )}
                  </div>
               </div>
               
               {/* Insufficient Inventory Badge */}
               {originsInDemand.some(o => totalDemand[o] > silos.filter(s => s.origin === o).reduce((sum, s) => sum + s.currentKg, 0)) && (
                  <div className="hidden xl:flex bg-red-600/20 border border-red-600/30 p-6 rounded-2xl flex-col items-center justify-center space-y-2 animate-pulse mt-4 md:mt-0">
                     <AlertCircle className="w-8 h-8 text-red-500" />
                     <span className="text-[10px] font-black text-red-500 uppercase tracking-widest text-center">Ruptura de Stock<br/>Inminente</span>
                  </div>
               )}
            </div>
         </div>
      </div>
    </div>
  );
};

export default SiloManager;
