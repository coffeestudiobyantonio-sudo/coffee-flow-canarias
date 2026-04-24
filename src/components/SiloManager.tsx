import React, { useState } from 'react';
import { Database, AlertCircle, ArrowDownToLine, Trash2, ArrowUpFromLine, Settings } from 'lucide-react';
import type { Silo } from '../App';
import { updateSilo } from '../lib/api';

interface SiloManagerProps {
  silos: Silo[];
  setSilos: React.Dispatch<React.SetStateAction<Silo[]>>;
}

const SiloManager: React.FC<SiloManagerProps> = ({ silos, setSilos }) => {
  const [selectedSiloId, setSelectedSiloId] = useState<number>(0);
  const [operationType, setOperationType] = useState<'FILL' | 'EMPTY' | 'ADJUST'>('FILL');
  const [adjustKg, setAdjustKg] = useState<number>(0);
  const [profileNameInput, setProfileNameInput] = useState<string>('');
  const [isMaintenanceMode, setIsMaintenanceMode] = useState<boolean>(false);

  const targetSilo = silos.find(s => s.id === selectedSiloId);

  const handleOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSilo || selectedSiloId === 0) return;

    let newKg = targetSilo.currentKg;
    let newProfile = targetSilo.profileName;

    if (operationType === 'FILL') {
       if (newKg > 0 && targetSilo.profileName !== profileNameInput) {
          alert('¡Peligro! No puedes mezclar dos perfiles distintos en el mismo silo.');
          return;
       }
       if (newKg + adjustKg > targetSilo.maxKg) {
          alert('El silo rebozará el nivel máximo.');
          return;
       }
       newKg += adjustKg;
       newProfile = profileNameInput;
    } else if (operationType === 'EMPTY') {
       if (adjustKg > newKg) {
          alert('No puedes retirar más kilos de los que hay.');
          return;
       }
       newKg -= adjustKg;
       if (newKg <= 0) newProfile = null;
    } else if (operationType === 'ADJUST') {
       newKg = adjustKg;
       if (newKg <= 0) newProfile = null;
    }

    const { lastFillDate } = targetSilo;
    const isNewFill = operationType === 'FILL' && targetSilo.currentKg === 0;

    const ok = await updateSilo(selectedSiloId, {
       currentKg: newKg,
       profileName: newProfile,
       lastFillDate: isNewFill ? new Date().toISOString() : lastFillDate
    });

    if (ok) {
       setSilos(prev => prev.map(s => s.id === selectedSiloId ? { ...s, currentKg: newKg, profileName: newProfile, lastFillDate: isNewFill ? new Date().toISOString() : s.lastFillDate } : s));
       setAdjustKg(0);
       alert('Operación registrada exitosamente.');
    } else {
       alert('Error base de datos.');
    }
  };

  const handlePurge = async () => {
     if (!targetSilo) return;
     if (confirm(`Vaciado de emergencia. El compartimento TS-${targetSilo.id} pasará a 0kg y perderá el perfil almacenado. ¿Confirmar purga?`)) {
        const ok = await updateSilo(targetSilo.id, { currentKg: 0, profileName: null });
        if (ok) {
            setSilos(prev => prev.map(s => s.id === targetSilo.id ? { ...s, currentKg: 0, profileName: null } : s));
        }
     }
  };

  const handleQuickReset = async (silo: Silo) => {
     if (confirm(`‼️ ATENCIÓN: Estás a punto de RESETEAR el Silo TS-${silo.id} a 0 kg.\n\n¿Estás completamente seguro de esta acción?`)) {
        if (confirm(`VERIFICACIÓN FINAL: Escribe "SI" para confirmar el reseteo del Silo TS-${silo.id}.`) || true) { // simplified double verification
           const userTyped = prompt(`Escriba el número del silo (${silo.id}) para confirmar el borrado total:`);
           if (userTyped === silo.id.toString()) {
              const ok = await updateSilo(silo.id, { currentKg: 0, profileName: null });
              if (ok) {
                 setSilos(prev => prev.map(s => s.id === silo.id ? { ...s, currentKg: 0, profileName: null } : s));
                 alert(`✅ Silo TS-${silo.id} purgado a 0.`);
              } else {
                 alert('❌ Error al conectar con la base de datos.');
              }
           } else {
              if (userTyped !== null) alert('❌ Verificación fallida. Número de silo incorrecto.');
           }
        }
     }
  };

  const handleQuickAdjust = async (silo: Silo) => {
     const input = prompt(`Ajuste de inventario para TS-${silo.id}\nIntroduce la nueva cantidad (KG):`, silo.currentKg.toString());
     if (input !== null) {
        const newKg = parseFloat(input);
        if (!isNaN(newKg) && newKg >= 0 && newKg <= silo.maxKg) {
           const newProfile = newKg === 0 ? null : silo.profileName;
           const ok = await updateSilo(silo.id, { currentKg: newKg, profileName: newProfile });
           if (ok) {
              setSilos(prev => prev.map(s => s.id === silo.id ? { ...s, currentKg: newKg, profileName: newProfile } : s));
           } else {
              alert('❌ Error al actualizar en la base de datos.');
           }
        } else {
           alert(`❌ Cantidad inválida. Debe ser un número entre 0 y ${silo.maxKg}.`);
        }
     }
  };

  // UI calculations
  const globalCapacity = silos.reduce((acc, s) => acc + s.maxKg, 0);
  const globalCurrent = silos.reduce((acc, s) => acc + s.currentKg, 0);

  return (
    <div className="flex flex-col h-full bg-dashboard-bg overflow-x-hidden">
      <div className="bg-gradient-to-r from-dashboard-panel to-dashboard-bg border-b border-dashboard-border px-8 py-6 mb-6 shrink-0 relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 80% 0%, #10b981 0%, transparent 40%)' }}></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between">
           <h1 className="text-3xl font-black text-white flex items-center tracking-tight mb-4 md:mb-0">
             <Database className="w-8 h-8 mr-3 text-green-400" /> Silos de Café Tostado
           </h1>
           <div className="flex gap-4">
              <div className="bg-dashboard-panel border border-dashboard-border px-6 py-3 rounded-2xl flex flex-col justify-center shadow-lg shadow-black/50 items-end">
                <span className="text-[10px] text-gray-400 uppercase font-black tracking-widest">Ocupación Batería</span>
                <span className="text-xl font-bold text-white font-mono">{((globalCurrent/globalCapacity)*100 || 0).toFixed(1)}% <span className="text-sm text-gray-500">[{globalCurrent}/{globalCapacity}kg]</span></span>
              </div>
              <button 
                 onClick={() => setIsMaintenanceMode(!isMaintenanceMode)}
                 className={`px-4 py-3 rounded-2xl border text-xs font-black uppercase tracking-widest transition-all shadow-lg flex items-center ${isMaintenanceMode ? 'bg-orange-600/20 text-orange-400 border-orange-500 hover:bg-orange-600/30' : 'bg-[#14161a] text-gray-500 border-dashboard-border hover:text-white'}`}
              >
                 <Settings className="w-4 h-4 mr-2" />
                 {isMaintenanceMode ? 'Cerrar Mantenimiento' : 'Modo Mantenimiento'}
              </button>
           </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 px-8 pb-8 overflow-y-auto">
        
        {/* Left Column: UI de Asignación / Ajuste (Only visible in Maintenance) */}
        {isMaintenanceMode && (
          <div className="lg:col-span-4 space-y-6">
             <div className="flex bg-[#14161a] p-1 rounded-xl mb-2 border border-dashboard-border">
               <button 
                 onClick={() => setOperationType('FILL')}
                 className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${operationType === 'FILL' ? 'bg-[#1e222b] text-green-400 shadow border border-green-500/30' : 'text-gray-500 hover:text-gray-300'}`}
               >
                 Cargar
               </button>
               <button 
                 onClick={() => setOperationType('EMPTY')}
                 className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${operationType === 'EMPTY' ? 'bg-[#1e222b] text-orange-400 shadow border border-orange-500/30' : 'text-gray-500 hover:text-gray-300'}`}
               >
                 Descargar
               </button>
               <button 
                 onClick={() => setOperationType('ADJUST')}
                 className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${operationType === 'ADJUST' ? 'bg-[#1e222b] text-red-500 shadow border border-red-500/30' : 'text-gray-500 hover:text-gray-300'}`}
               >
                 Calibrar
               </button>
             </div>

            <div className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-8 shadow-2xl relative overflow-hidden">
               <h2 className="text-xl font-bold mb-6 text-white flex items-center uppercase tracking-widest relative z-10 border-b border-dashboard-border pb-4">
                 {operationType === 'FILL' && <ArrowDownToLine className="w-6 h-6 mr-3 text-green-400" />}
                 {operationType === 'EMPTY' && <ArrowUpFromLine className="w-6 h-6 mr-3 text-orange-400" />}
                 {operationType === 'ADJUST' && <AlertCircle className="w-6 h-6 mr-3 text-red-500" />}
                 Comandos Panel de Control
               </h2>

               <form onSubmit={handleOperation} className="space-y-6 relative z-10">
                 <div>
                   <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Compartimento</label>
                   <select 
                     className="w-full bg-[#14161a] border border-dashboard-border rounded-xl p-4 text-white focus:outline-none focus:border-green-500 transition-colors appearance-none font-medium"
                     value={selectedSiloId}
                     onChange={e => setSelectedSiloId(Number(e.target.value))}
                     required
                   >
                     <option value={0} disabled>Seleccione un grupo</option>
                     {silos.map(s => (
                       <option key={s.id} value={s.id}>Silo TS-{s.id} ({s.currentKg}kg) {s.profileName ? `- ${s.profileName}` : ''}</option>
                     ))}
                   </select>
                 </div>

                 {operationType === 'FILL' && (
                     <div>
                       <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Perfil Asignado (Lote Final)</label>
                       <input 
                         type="text" 
                         disabled={targetSilo && targetSilo.currentKg > 0}
                         className="w-full bg-[#14161a] border border-dashboard-border rounded-xl p-4 text-white focus:outline-none focus:border-green-500 transition-colors"
                         value={targetSilo && targetSilo.currentKg > 0 && targetSilo.profileName ? targetSilo.profileName : profileNameInput}
                         onChange={e => setProfileNameInput(e.target.value)}
                         placeholder="Ej: Mezcla Barista Oro..."
                         required
                       />
                     </div>
                 )}

                 <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Kilos Netos</label>
                    <div className="flex bg-[#14161a] border border-dashboard-border rounded-xl px-4 py-2 focus-within:border-green-500 transition-colors">
                      <input 
                        type="number" min="1" max="400" step="0.5"
                        className="w-full bg-transparent text-2xl font-black text-white focus:outline-none"
                        value={adjustKg || ''}
                        onChange={e => setAdjustKg(parseFloat(e.target.value) || 0)}
                        required
                      />
                      <span className="text-gray-500 font-black text-xl flex items-center ml-2">KG</span>
                    </div>
                 </div>

                 <button type="submit" className={`w-full py-4 rounded-xl font-black shadow-lg transition-all text-sm uppercase tracking-widest ${
                     operationType === 'FILL' ? 'bg-green-600 hover:bg-green-500 text-white shadow-green-500/20' : 
                     operationType === 'EMPTY' ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-500/20' : 
                     'bg-red-600 hover:bg-red-500 text-white shadow-red-500/20'
                 }`}>
                   {operationType === 'FILL' && 'Confirmar Ingreso a Silo'}
                   {operationType === 'EMPTY' && 'Confirmar Evacuación (A Envasado)'}
                   {operationType === 'ADJUST' && 'Aplicar Sobrescritura'}
                 </button>
                 
               </form>

               {operationType === 'ADJUST' && targetSilo && (
                   <button onClick={handlePurge} className="mt-4 w-full py-4 rounded-xl border border-red-900/30 bg-transparent text-red-500 hover:bg-red-500/10 font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center">
                     <Trash2 className="w-4 h-4 mr-2" /> Purgar Silo a 0
                   </button>
               )}
          </div>
        </div>
        )}

        {/* Right Column: Matriz de Silos */}
        <div className={`${isMaintenanceMode ? 'lg:col-span-8' : 'lg:col-span-12'} transition-all duration-500 flex flex-col min-h-0 bg-dashboard-panel border border-dashboard-border rounded-3xl overflow-hidden shadow-2xl`}>
          <div className="p-6 border-b border-dashboard-border bg-[#14161a] flex justify-between items-center">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center">
              <Database className="w-4 h-4 mr-2" /> Batería de Almacenamiento Tostado
            </h2>
          </div>

          <div className="p-8 flex-1 overflow-y-auto">
             <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {silos.map(s => {
                   const rawPct = (s.currentKg / s.maxKg) * 100;
                   const isFull = rawPct >= 98;
                   const isEmpty = rawPct === 0;

                   return (
                     <div 
                        key={s.id}
                        className={`relative rounded-2xl border-2 transition-all p-4 flex flex-col justify-between aspect-[1/1.5] ${
                           selectedSiloId === s.id ? 'border-green-500 bg-green-500/5 shadow-[0_0_20px_rgba(16,185,129,0.15)]' : 
                           'border-dashboard-border bg-[#14161a] hover:border-gray-600'
                        }`}
                        onClick={() => setSelectedSiloId(s.id)}
                     >
                       {/* Level Indicator (Background) */}
                       <div 
                          className="absolute bottom-0 left-0 right-0 bg-green-500/10 rounded-b-xl z-0 transition-all duration-1000 ease-in-out"
                          style={{ height: `${rawPct}%` }}
                       ></div>

                       {/* Border indicating fill exact height */}
                       <div className="absolute bottom-0 left-0 right-0 w-full z-0 border-t border-green-500/30 transition-all duration-1000 ease-in-out" style={{ bottom: `${rawPct}%` }}></div>

                       <div className="relative z-10 flex justify-between items-start mb-2 group">
                          <span className="text-gray-500 font-black uppercase text-[10px] tracking-widest">TS-{s.id}</span>
                          <div className="flex items-center space-x-2">
                             <div className="hidden group-hover:flex items-center bg-black/40 rounded p-0.5 space-x-1 absolute right-4 -top-1">
                                <button 
                                   onClick={(e) => { e.stopPropagation(); handleQuickAdjust(s); }}
                                   className="text-yellow-500 hover:text-yellow-400 p-1 hover:bg-white/10 rounded" title="Modificar Cantidad Manualmente"
                                >
                                   <ArrowUpFromLine className="w-3 h-3" />
                                </button>
                                <button 
                                   onClick={(e) => { e.stopPropagation(); handleQuickReset(s); }}
                                   className="text-red-500 hover:text-red-400 p-1 hover:bg-white/10 rounded" title="Resetear Silo (Purgar a 0)"
                                >
                                   <Trash2 className="w-3 h-3" />
                                </button>
                             </div>
                             <div className={`w-2 h-2 rounded-full ${isEmpty ? 'bg-gray-600' : isFull ? 'bg-red-500 animate-pulse' : 'bg-green-500 '}`}></div>
                          </div>
                       </div>

                       <div className="relative z-10 text-center my-auto group cursor-pointer" onClick={(e) => { e.stopPropagation(); handleQuickAdjust(s); }}>
                          <p className="text-3xl font-black text-white font-mono hover:text-green-300 transition-colors">{s.currentKg}<span className="text-xs text-gray-500 ml-1">kg</span></p>
                          <p className="text-[9px] text-gray-500 uppercase font-bold tracking-widest mt-1">/ {s.maxKg} MAX</p>
                       </div>

                       <div className="relative z-10 flex flex-col items-center mt-2 group-hover:opacity-100">
                          {s.profileName ? (
                             <span className="text-center bg-[#1e222b] border border-gray-700 px-2 py-1 rounded text-[9px] font-bold text-green-300 w-full truncate">
                               {s.profileName}
                             </span>
                          ) : (
                             <span className="text-center px-2 py-1 text-[9px] font-bold text-gray-600 italic">Vacio</span>
                          )}
                       </div>
                     </div>
                   );
                })}
             </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SiloManager;
