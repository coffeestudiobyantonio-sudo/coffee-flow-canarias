import React, { useState } from 'react';
import { Target, Plus, Trash2, Box, Coffee, AlertTriangle, Calculator, Activity } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import type { MasterProfile, InventoryLot } from '../App';
import { createMasterProfile } from '../lib/api';

interface MasterProfilesProps {
  inventoryLots: InventoryLot[];
  masterProfiles: MasterProfile[];
  setMasterProfiles: React.Dispatch<React.SetStateAction<MasterProfile[]>>;
}

const PIE_COLORS: Record<string, string> = {
  'Colombia Supremo': '#f59e0b',
  'Brasil Cerrado': '#10b981',
  'Vietnam Robusta': '#ef4444',
  'Etiopía Yirgacheffe': '#3b82f6',
  'Uganda': '#8b5cf6'
};

const getLotColor = (origin: string, index: number) => PIE_COLORS[origin] || ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'][index % 5];

const BATCH_SIZE_KG = 120; // Standard roaster capacity for calculations

const MasterProfiles: React.FC<MasterProfilesProps> = ({ inventoryLots, masterProfiles, setMasterProfiles }) => {
  // SSOT Filter base: allow validated lots regardless of current raw stock kg
  const baseValidLots = inventoryLots.filter(l => l.status === 'VALIDATED');

  const [isCreating, setIsCreating] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<number | null>(null);
  const [newProfile, setNewProfile] = useState<MasterProfile>({
    name: '',
    roastedType: 'NATURAL',
    businessUnit: 'PROPIA',
    roastStrategy: 'PRE_BLEND',
    agtron: 55.0,
    blend: [],
    sensory: { fragrancia: 7.0, aroma: 7.0, sabor: 7.0, cuerpo: 7.0 }
  });

  // Filter lots based on BU Unit
  const availableLots = baseValidLots.filter(l => newProfile.businessUnit === 'PROPIA' ? l.exclusiveFor !== 'LIDL' : true);

  // Blend Logic
  const handleAddOrigin = () => {
    const available = availableLots.find(l => !newProfile.blend.some(b => b.origin === l.origin));
    if (available) {
      setNewProfile({
        ...newProfile,
        blend: [...newProfile.blend, { origin: available.origin, percentage: 0 }]
      });
    }
  };

  const handleUpdateBlend = (index: number, field: 'origin' | 'percentage', value: string | number) => {
    const newBlend = [...newProfile.blend];
    newBlend[index] = { ...newBlend[index], [field]: value };
    setNewProfile({ ...newProfile, blend: newBlend });
  };

  const handleRemoveOrigin = (index: number) => {
    const newBlend = newProfile.blend.filter((_, i) => i !== index);
    setNewProfile({ ...newProfile, blend: newBlend });
  };

  const totalPercentage = newProfile.blend.reduce((sum, item) => sum + item.percentage, 0);
  const isBlendValid = totalPercentage === 100;

  // Single Source of Truth Checks
  const insufficientStockOrigins = newProfile.blend.filter(b => {
    const lot = availableLots.find(l => l.origin === b.origin);
    if (!lot) return true;
    
    // Phase 19 fix: Don't block recipe creation based on stock, as it may be in Silos.
    // Real physical constraints are handled by the Hub.
    return false;
  });

  const estimatedCostPerKg = newProfile.blend.reduce((sum, b) => {
    const lot = availableLots.find(l => l.origin === b.origin);
    const price = lot ? lot.price_per_kg : 0;
    return sum + (price * (b.percentage / 100));
  }, 0);

  const getStockIndicator = (kg: number) => {
    if (kg > 5000) return <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" title="Stock Alto"></span>;
    if (kg > 1000) return <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]" title="Stock Medio"></span>;
    return <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse" title="Últimos Sacos"></span>;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newProfile.name.trim() !== '' && isBlendValid) {
      
      const isSuccess = await createMasterProfile(newProfile);
      if (!isSuccess) {
        alert("Error de red: No se pudo guardar el nuevo perfil en Supabase.");
        return;
      }

      setMasterProfiles([newProfile, ...masterProfiles]);
      setIsCreating(false);
      setNewProfile({
        name: '', roastedType: 'NATURAL', agtron: 55.0, businessUnit: 'PROPIA', roastStrategy: 'PRE_BLEND',
        blend: [],
        sensory: { fragrancia: 7.0, aroma: 7.0, sabor: 7.0, cuerpo: 7.0 }
      });
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-dashboard-bg text-gray-200 overflow-y-auto">
      
      {/* Top Banner Misión */}
      <div className="bg-dashboard-panel border-b border-dashboard-border px-10 py-8 shadow-sm flex flex-col justify-center relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-coffee-accent/5 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
        <h1 className="text-3xl font-black tracking-tight text-white mb-2 uppercase flex items-center">
           <Target className="w-8 h-8 mr-3 text-coffee-accent" /> Arquitecto de Gamas (Perfiles)
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl">
          Selecciona una gama existente o diseña la composición exacta del blend usando datos del Almacén en Tiempo Real.
        </p>
      </div>

      <div className="p-10 flex-1 relative z-10 max-w-7xl mx-auto w-full">
        
        {isCreating ? (
          <div className="bg-[#14161a] border border-dashboard-border rounded-3xl p-8 shadow-2xl">
            <h2 className="text-2xl font-bold mb-6 text-white flex items-center">
              <Coffee className="w-6 h-6 mr-3 text-coffee-light" />
              Diseñar Nueva Gama Comercial
            </h2>
            <form onSubmit={handleCreate} className="space-y-10">
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                {/* Left Column: Basic & Sensory */}
                <div className="space-y-8">
                   <div className="bg-dashboard-panel p-6 rounded-2xl border border-dashboard-border">
                     <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 border-b border-dashboard-border pb-2">Parámetros Maestros</h3>
                     <div className="space-y-5">
                       
                       {/* Business Unit Selector */}
                       <div className="flex bg-[#14161a] border border-dashboard-border rounded-lg p-1">
                          <button
                            type="button"
                            onClick={() => setNewProfile({...newProfile, businessUnit: 'PROPIA', blend: []})}
                            className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${newProfile.businessUnit === 'PROPIA' ? 'bg-[#1e222b] text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                          >
                            Marca Propia
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewProfile({...newProfile, businessUnit: 'LIDL', blend: []})}
                            className={`flex-1 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all ${newProfile.businessUnit === 'LIDL' ? 'bg-coffee-accent/20 text-coffee-light shadow border border-coffee-accent/30' : 'text-gray-500 hover:text-coffee-light'}`}
                          >
                            Externa (MDD)
                          </button>
                       </div>

                       <div>
                         <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Nombre de la Gama</label>
                         <input 
                           type="text" required
                           className="w-full bg-[#1e222b] border border-dashboard-border rounded-xl p-3 text-white focus:outline-none focus:border-coffee-light transition-colors"
                           value={newProfile.name}
                           onChange={e => setNewProfile({...newProfile, name: e.target.value})}
                         />
                       </div>
                       <div>
                         <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Estrategia de Tueste (Protocolo)</label>
                         <div className="flex bg-[#14161a] border border-dashboard-border rounded-lg p-1">
                            <button
                              type="button"
                              onClick={() => setNewProfile({...newProfile, roastStrategy: 'PRE_BLEND'})}
                              className={`flex-1 flex flex-col items-center justify-center py-2 px-2 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${newProfile.roastStrategy === 'PRE_BLEND' ? 'bg-[#1e222b] text-white shadow border border-gray-600' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                              <span className="text-white mb-0.5">🟢 Pre-Blend</span>
                              <span className="text-gray-500 text-[9px] font-normal normal-case">Mezclar verdes y tostar lote único</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewProfile({...newProfile, roastStrategy: 'POST_BLEND'})}
                              className={`flex-1 flex flex-col items-center justify-center py-2 px-2 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${newProfile.roastStrategy === 'POST_BLEND' ? 'bg-[#1e222b] text-coffee-light shadow border border-coffee-accent/30' : 'text-gray-500 hover:text-gray-300'}`}
                            >
                              <span className="text-coffee-light mb-0.5">🔄 Post-Blend</span>
                              <span className="text-gray-500 text-[9px] font-normal normal-case">Tostar separados y ensamblar al final</span>
                            </button>
                         </div>
                       </div>
                       
                       <div className="grid grid-cols-2 gap-4">
                         <div>
                           <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Tueste</label>
                           <div className="flex bg-[#14161a] border border-dashboard-border rounded-lg p-1">
                              <button
                                type="button"
                                onClick={() => setNewProfile({...newProfile, roastedType: 'NATURAL'})}
                                className={`flex-1 flex items-center justify-center py-2 px-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${newProfile.roastedType === 'NATURAL' ? 'bg-[#1e222b] text-white shadow border border-gray-600' : 'text-gray-500 hover:text-gray-300'}`}
                              >
                                <span>🟢 <span className={newProfile.roastedType === 'NATURAL' ? 'text-white' : ''}>Natural</span></span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setNewProfile({...newProfile, roastedType: 'TORREFACTO'})}
                                className={`flex-1 flex items-center justify-center py-2 px-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${newProfile.roastedType === 'TORREFACTO' ? 'bg-[#1e222b] text-orange-400 shadow border border-orange-500/30' : 'text-gray-500 hover:text-gray-300'}`}
                              >
                                <span>🟤 <span className={newProfile.roastedType === 'TORREFACTO' ? 'text-orange-400' : ''}>Torrefacto</span></span>
                              </button>
                           </div>
                         </div>

                         <div>
                           <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Target Agtron</label>
                           <input 
                             type="number" step="0.5" required min="30" max="80"
                             className="w-full bg-[#1e222b] border border-dashboard-border rounded-xl p-3 text-white focus:outline-none focus:border-coffee-light transition-colors font-mono"
                             value={newProfile.agtron}
                             onChange={e => setNewProfile({...newProfile, agtron: parseFloat(e.target.value)})}
                           />
                         </div>
                       </div>
                     </div>
                   </div>

                   {/* Radar Chart Sensory Builder */}
                   <div className="bg-dashboard-panel p-6 rounded-2xl border border-dashboard-border">
                     <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 border-b border-dashboard-border pb-2">Perfil Sensorial Objetivo</h3>
                     {['fragrancia', 'aroma', 'sabor', 'cuerpo'].map((metric) => (
                       <div key={metric} className="mb-4">
                         <div className="flex justify-between mb-1">
                           <span className="text-xs uppercase font-medium text-gray-400">{metric}</span>
                           <span className="text-xs text-purple-400 font-bold font-mono">{(newProfile.sensory as any)[metric].toFixed(1)}</span>
                         </div>
                         <input 
                           type="range" min="6.0" max="10.0" step="0.5"
                           value={(newProfile.sensory as any)[metric]}
                           onChange={(e) => setNewProfile({
                             ...newProfile, 
                             sensory: { ...newProfile.sensory, [metric]: parseFloat(e.target.value)}
                           })}
                           className="w-full h-2 bg-[#14161a] rounded-lg appearance-none cursor-pointer accent-purple-500"
                         />
                       </div>
                     ))}
                   </div>
                </div>

                {/* Right Column: Blend Compositor */}
                <div className="bg-dashboard-panel p-6 rounded-2xl border border-dashboard-border flex flex-col relative overflow-hidden">
                   
                   <div className="flex justify-between items-center mb-4 border-b border-dashboard-border pb-2 relative z-10">
                     <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center">
                        <Activity className="w-4 h-4 mr-2" />
                        Composición del Blend
                     </h3>
                     <span className={`text-sm font-bold px-3 py-1 rounded bg-[#14161a] border ${isBlendValid ? 'text-green-400 border-green-500/30' : 'text-red-400 border-red-500/30'}`}>
                       Total: {totalPercentage}%
                     </span>
                   </div>

                   {/* Dynamic Origin Selector linked to InventoryLot State */}
                   <div className="space-y-4 mb-6 relative z-20">
                     {availableLots.length === 0 && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-bold flex items-center">
                           <AlertTriangle className="w-5 h-5 mr-3" /> No hay datos de origen validados en el sistema.
                        </div>
                     )}

                     {newProfile.blend.map((item, index) => {
                       const inventoryRef = availableLots.find(l => l.origin === item.origin);

                       return (
                       <div key={index} className="p-4 bg-[#14161a] rounded-xl border border-dashboard-border group relative">
                         <div className="flex items-center space-x-3 mb-3">
                           
                           {/* Color Coded Indicator Wrapper */}
                           <div className="relative flex-1">
                              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center">
                                 {inventoryRef ? getStockIndicator(inventoryRef.stock_kg) : <Box className="w-4 h-4 text-gray-600" />}
                              </div>
                              <select 
                                className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg pl-8 pr-2 py-2 text-white font-semibold focus:outline-none focus:border-coffee-light appearance-none tracking-wide text-sm"
                                value={item.origin}
                                onChange={(e) => handleUpdateBlend(index, 'origin', e.target.value)}
                              >
                                {availableLots.map(l => (
                                  <option key={l.id} value={l.origin} disabled={newProfile.blend.some(b => b.origin === l.origin && b.origin !== item.origin)}>
                                    {l.origin} — {l.stock_kg}kg
                                  </option>
                                ))}
                              </select>
                           </div>

                           <div className="flex items-center bg-[#1e222b] border border-dashboard-border rounded-lg px-2 py-2">
                             <input 
                               type="number" min="0" max="100"
                               className="w-16 bg-transparent text-right text-white font-mono font-bold focus:outline-none"
                               value={item.percentage}
                               onChange={(e) => handleUpdateBlend(index, 'percentage', parseInt(e.target.value) || 0)}
                             />
                             <span className="text-gray-400 ml-1 font-bold">%</span>
                           </div>
                           <button type="button" onClick={() => handleRemoveOrigin(index)} className="text-gray-500 hover:text-red-400 p-2 transition-colors">
                             <Trash2 className="w-5 h-5" />
                           </button>
                         </div>
                         
                         {/* Linked lot metadata & real-time cost analysis */}
                         <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-500 bg-[#1e222b]/50 p-2 rounded-lg border border-[#1e222b]">
                           <div className="flex items-center">
                              <Box className="w-3 h-3 mr-1 opacity-70" />
                              <span className="text-coffee-light font-mono truncate mr-3">
                                {inventoryRef ? inventoryRef.id : 'N/A'}
                              </span>
                           </div>
                           <div className="flex space-x-4">
                              <span className="font-mono" title="Precio Base">€{inventoryRef?.price_per_kg.toFixed(2)}/kg</span>
                              <span className="font-mono text-gray-400" title="Humedad Inicial">H₂O: {inventoryRef?.moisture}%</span>
                           </div>
                         </div>
                       </div>
                     )})}
                     
                     {newProfile.blend.length < availableLots.length && (
                       <button 
                         type="button" 
                         onClick={handleAddOrigin}
                         className="w-full border border-dashed border-dashboard-border hover:border-coffee-light text-gray-500 hover:text-white rounded-xl p-3 flex justify-center items-center transition-colors text-sm font-bold tracking-widest uppercase"
                       >
                         <Plus className="w-4 h-4 mr-2" /> Añadir Origen
                       </button>
                     )}
                   </div>

                   {/* Alerts panel */}
                   <div className="relative z-20 space-y-2 mb-6">
                      {!isBlendValid && (
                        <div className="flex items-center text-[11px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                          <AlertTriangle className="w-4 h-4 mr-2" /> Composición inválida (≠ 100%).
                        </div>
                      )}
                      
                      {insufficientStockOrigins.length > 0 && (
                        <div className="flex items-center text-[11px] font-bold uppercase tracking-widest text-orange-400 bg-orange-400/10 p-3 rounded-lg border border-orange-400/20 shadow-inner">
                          <Activity className="w-4 h-4 mr-2" /> 
                          Aviso: Stock bajo para {insufficientStockOrigins[0].origin} (Tueste {BATCH_SIZE_KG}kg).
                        </div>
                      )}
                   </div>

                   {/* Real-time Blend Cost & Chart */}
                   <div className="flex-1 mt-auto flex items-end">
                      <div className="w-full h-[220px] bg-[#14161a] rounded-xl relative p-2 flex items-center justify-center border border-dashboard-border shadow-inner">
                        
                        {/* Live Price Tag */}
                        <div className="absolute top-3 left-4 bg-dashboard-panel border border-dashboard-border rounded-lg px-3 py-2 flex items-center shadow-lg z-10">
                           <Calculator className="w-4 h-4 text-green-400 mr-2" />
                           <div className="flex flex-col">
                              <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest leading-none">Coste Estimado</span>
                              <span className="text-white font-mono font-bold text-sm tracking-tight hidden lg:block">€{estimatedCostPerKg.toFixed(2)} / kg</span>
                           </div>
                        </div>

                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={newProfile.blend.filter(b => b.percentage > 0)}
                              cx="50%" cy="50%"
                              innerRadius={65} outerRadius={85}
                              paddingAngle={5}
                              dataKey="percentage"
                              nameKey="origin"
                              stroke="none"
                            >
                              {newProfile.blend.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={getLotColor(entry.origin, index)} />
                              ))}
                            </Pie>
                            <RechartsTooltip 
                              contentStyle={{ backgroundColor: '#1a1d24', borderColor: '#2e3340', color: '#fff', borderRadius: '8px', zIndex: 100 }}
                              itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                              formatter={(value) => [`${value}%`]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-3xl font-black text-white">{totalPercentage}%</span>
                          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Blend</span>
                        </div>
                      </div>
                   </div>

                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-4 pt-4 border-t border-dashboard-border">
                <button 
                  type="submit" 
                  disabled={!isBlendValid || availableLots.length === 0}
                  className={`flex-1 font-black uppercase tracking-widest py-5 px-6 rounded-xl transition-all shadow-xl
                    ${isBlendValid && availableLots.length > 0
                      ? 'bg-coffee-accent hover:bg-coffee-light text-white shadow-[0_0_20px_rgba(217,119,6,0.3)]' 
                      : 'bg-[#14161a] border border-dashboard-border text-gray-600 cursor-not-allowed'}`}
                >
                  Confirmar y Guardar Estándar
                </button>
                <button type="button" onClick={() => setIsCreating(false)} className="px-10 bg-[#1e222b] hover:bg-dashboard-border text-gray-300 font-bold uppercase tracking-widest py-5 rounded-xl transition-all">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-10">
            
            {/* Create New Card */}
            <button 
              onClick={() => {
                setIsCreating(true);
                if (newProfile.blend.length === 0 && baseValidLots.length > 0) {
                   setNewProfile({...newProfile, blend: [{ origin: baseValidLots[0].origin, percentage: 100 }]});
                }
              }}
              className="bg-dashboard-panel border-2 border-dashed border-dashboard-border rounded-3xl p-8 min-h-[350px] flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-coffee-light hover:bg-[#1e222b] transition-all group shadow-sm"
            >
              <div className="bg-[#14161a] p-4 rounded-full mb-4 group-hover:scale-110 transition-transform shadow-inner">
                <Plus className="w-12 h-12 text-coffee-light" />
              </div>
              <h3 className="text-xl font-bold uppercase tracking-widest mt-2">Crear Gama / Módulo</h3>
              <p className="text-sm mt-3 text-center px-4 font-medium">Extrae datos del Inventario Global y diseña la arquitectura de blend.</p>
            </button>

            {/* List Profiles */}
            {masterProfiles.map((profile, i) => {
              const radarData = [
                { subject: 'Fra', val: profile.sensory.fragrancia },
                { subject: 'Aro', val: profile.sensory.aroma },
                { subject: 'Sab', val: profile.sensory.sabor },
                { subject: 'Cue', val: profile.sensory.cuerpo },
              ];

              return (
                <div key={i} className="bg-dashboard-panel border border-dashboard-border rounded-3xl flex flex-col overflow-hidden shadow-xl hover:shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-shadow group relative">
                  <div className="p-6 border-b border-dashboard-border bg-gradient-to-br from-[#1e222b] to-dashboard-panel z-10 flex justify-between items-start">
                     <div className="flex-1 min-w-0">
                       <h3 className="text-xl font-black text-white truncate pr-4" title={profile.name}>{profile.name}</h3>
                       <div className="flex flex-wrap gap-2 mt-3">
                         <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${profile.businessUnit === 'LIDL' ? 'text-coffee-light bg-coffee-accent/10 border-coffee-accent/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20'}`}>
                           {profile.businessUnit === 'LIDL' ? 'EXT: LIDL' : 'MARCA PROPIA'}
                         </span>
                         <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${profile.roastStrategy === 'PRE_BLEND' ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-orange-400 bg-orange-500/10 border-orange-500/20'}`}>
                           {profile.roastStrategy === 'PRE_BLEND' ? 'PRE-BLEND' : 'POST-BLEND'}
                         </span>
                         <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${profile.roastedType === 'TORREFACTO' ? 'text-orange-400 bg-orange-500/10 border-orange-500/30' : 'text-green-400 bg-green-500/10 border-green-500/30'}`}>
                           {profile.roastedType === 'TORREFACTO' ? 'MEZCLA TORREFACTO' : 'TUESTE NATURAL'}
                         </span>
                         <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
                           AGTRON: {profile.agtron}
                         </span>
                       </div>
                     </div>
                     <button
                       onClick={() => setProfileToDelete(i)}
                       className="text-gray-500 hover:text-red-400 p-2 transition-colors ml-2 bg-[#14161a] rounded-lg border border-dashboard-border hover:border-red-500/30"
                       title="Eliminar Gama"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
                  
                  <div className="flex flex-1 relative bg-[#14161a]">
                     {/* Radar Background */}
                     <div className="absolute inset-0 opacity-50 pointer-events-none">
                       <ResponsiveContainer width="100%" height="100%">
                         <RadarChart cx="70%" cy="50%" outerRadius="60%" data={radarData}>
                           <PolarGrid stroke="#2e3340" />
                           <PolarAngleAxis dataKey="subject" tick={false} />
                           <Radar dataKey="val" stroke="#a855f7" fill="#a855f7" fillOpacity={0.15} />
                         </RadarChart>
                       </ResponsiveContainer>
                     </div>

                     {/* Blend Composition Display */}
                     <div className="z-10 w-full p-4 flex flex-col justify-center">
                       <h4 className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-3 px-2 border-b border-dashboard-border pb-1">Composición / SSOT Link</h4>
                       <div className="space-y-2">
                         {profile.blend.map((b, idx) => (
                           <div key={idx} className="flex justify-between items-center text-xs px-2 bg-[#1e222b] py-1.5 rounded-md border border-dashboard-border">
                             <span className="flex items-center text-gray-300 font-medium truncate max-w-[140px]">
                               <div className="w-2 h-2 rounded-full mr-2 shadow-sm" style={{ backgroundColor: getLotColor(b.origin, idx) }}></div>
                               {b.origin}
                             </span>
                             <span className="font-mono font-bold text-white ml-2 bg-[#14161a] px-2 py-0.5 rounded">{b.percentage}%</span>
                           </div>
                         ))}
                       </div>
                     </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modern Confirmation Modal for Deletion */}
      {profileToDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-[#14161a] border border-red-500/30 rounded-3xl p-8 max-w-md w-full shadow-[0_0_40px_rgba(239,68,68,0.15)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
            
            <div className="flex items-center mb-6">
              <div className="bg-red-500/10 p-3 rounded-full mr-4 border border-red-500/20">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-widest text-white">Precaución</h3>
            </div>
            
            <p className="text-gray-400 mb-8 leading-relaxed text-sm">
              Estás a punto de eliminar la gama comercial <span className="font-bold text-white max-w-full inline-block truncate align-bottom">"{masterProfiles[profileToDelete]?.name}"</span>. 
              Esta acción borrará el estándar maestro para el inventario, el tueste IoT y el control de calidad. <br/><br/>¿Deseas continuar?
            </p>
            
            <div className="flex space-x-4">
              <button 
                onClick={() => setProfileToDelete(null)}
                className="flex-1 bg-[#1e222b] hover:bg-dashboard-border text-gray-300 font-bold uppercase tracking-widest py-4 rounded-xl transition-all"
              >
                MantenerGama
              </button>
              <button 
                onClick={() => {
                  setMasterProfiles(masterProfiles.filter((_, i) => i !== profileToDelete));
                  setProfileToDelete(null);
                }}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest py-4 rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.3)] transition-all transform active:scale-95"
              >
                Eliminar Oficialmente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterProfiles;
