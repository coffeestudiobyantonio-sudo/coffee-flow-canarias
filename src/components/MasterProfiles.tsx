import React, { useState } from 'react';
import { Target, Plus, Trash2, Coffee, AlertTriangle, Activity, Edit2, Package } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import type { MasterProfile } from '../App';
import { createMasterProfile, deleteMasterProfile, updateMasterProfile } from '../lib/api';

const GREEN_ORIGINS = [
  'Brasil Cerrado',
  'Colombia Supremo',
  'Uganda',
  'Etiopía Yirgacheffe',
  'Vietnam Robusta',
  'Costa Rica'
];

interface MasterProfilesProps {
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

const MasterProfiles: React.FC<MasterProfilesProps> = ({ masterProfiles, setMasterProfiles }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [editingProfileName, setEditingProfileName] = useState<string | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<number | null>(null);
  const [newProfile, setNewProfile] = useState<MasterProfile>({
    name: '',
    roastedType: 'NATURAL',
    businessUnit: 'PROPIA',
    roastStrategy: 'POST_BLEND',
    expectedShrinkage: 16.0,
    agtron: 55.0,
    blend: [],
    sensory: { fragrancia: 7.0, aroma: 7.0, sabor: 7.0, cuerpo: 7.0 }
  });

  // Blend Logic
  const handleAddOrigin = () => {
    let available = GREEN_ORIGINS.find(origin => !newProfile.blend.some(b => b.origin === origin));
    if (!available) available = `Nuevo Origen ${newProfile.blend.length + 1}`;
    
    setNewProfile({
      ...newProfile,
      blend: [...newProfile.blend, { origin: available, percentage: 0, sackWeight: 60 }]
    });
  };

  const handleUpdateBlend = (index: number, field: 'origin' | 'percentage' | 'sackWeight', value: string | number) => {
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newProfile?.name.trim() !== '' && isBlendValid) {
      
      if (editingProfileName) {
         const isSuccess = await updateMasterProfile(editingProfileName, newProfile);
         if (!isSuccess) {
           alert("Error de red: No se pudo actualizar el perfil en Supabase.");
           return;
         }
         setMasterProfiles(masterProfiles.map(p => p?.name === editingProfileName ? newProfile : p));
      } else {
         const isSuccess = await createMasterProfile(newProfile);
         if (!isSuccess) {
           alert("Error de red: No se pudo guardar el nuevo perfil en Supabase.");
           return;
         }
         setMasterProfiles([newProfile, ...masterProfiles]);
      }

      setIsCreating(false);
      setEditingProfileName(null);
      setNewProfile({
        name: '', roastedType: 'NATURAL', agtron: 55.0, businessUnit: 'PROPIA', roastStrategy: 'POST_BLEND', expectedShrinkage: 16.0,
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
              {editingProfileName ? `Modificar Gama: ${editingProfileName}` : 'Diseñar Nueva Gama Comercial'}
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
                           className={`w-full border rounded-xl p-3 text-white transition-colors focus:outline-none ${editingProfileName ? 'bg-[#14161a] border-dashboard-border text-gray-500 cursor-not-allowed opacity-70' : 'bg-[#1e222b] border-dashboard-border focus:border-coffee-light'}`}
                           value={newProfile?.name}
                           onChange={e => setNewProfile({...newProfile, name: e.target.value})}
                           disabled={editingProfileName !== null}
                         />
                       </div>
                       
                       <div className="grid grid-cols-1 gap-4">
                         <div>
                           <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Target Agtron</label>
                           <input 
                             type="number" step="0.5" required min="30" max="80"
                             className="w-full bg-[#1e222b] border border-dashboard-border rounded-xl p-3 text-white focus:outline-none focus:border-coffee-light transition-colors font-mono"
                             value={newProfile.agtron}
                             onChange={e => setNewProfile({...newProfile, agtron: parseFloat(e.target.value)})}
                           />
                         </div>
                         <div>
                           <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Merma Esperada (%)</label>
                           <input 
                             type="number" step="0.1" required min="10" max="25"
                             className="w-full bg-[#1e222b] border border-dashboard-border rounded-xl p-3 text-white focus:outline-none focus:border-coffee-light transition-colors font-mono"
                             value={newProfile.expectedShrinkage || 16.0}
                             onChange={e => setNewProfile({...newProfile, expectedShrinkage: parseFloat(e.target.value)})}
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

                   {/* Dynamic Origin Selector linked to Text Array */}
                   <div className="space-y-4 mb-6 relative z-20">
                     {newProfile.blend.map((item, index) => {

                       return (
                       <div key={index} className="p-4 bg-[#14161a] rounded-xl border border-dashboard-border group relative">
                         <div className="flex items-center space-x-3 mb-3">
                           
                           {/* Color Coded Indicator Wrapper */}
                           <div className="relative flex-1">
                              <select 
                                className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg px-4 py-2 text-white font-semibold focus:outline-none focus:border-coffee-light tracking-wide text-sm appearance-none"
                                value={item.origin}
                                onChange={(e) => {
                                  if (e.target.value === '___NEW___') {
                                     const custom = window.prompt("Introduce el nombre del nuevo Origen:");
                                     if (custom && custom.trim() !== '') {
                                        handleUpdateBlend(index, 'origin', custom.trim());
                                     }
                                  } else {
                                     handleUpdateBlend(index, 'origin', e.target.value);
                                  }
                                }}
                              >
                                {Array.from(new Set([...GREEN_ORIGINS, ...newProfile.blend.map(b => b.origin)])).map(origin => (
                                  <option key={origin} value={origin}>{origin}</option>
                                ))}
                                <option value="___NEW___" className="text-coffee-light font-bold">+ Escribir Nuevo Origen...</option>
                              </select>
                           </div>

                           <div className="flex items-center space-x-2">
                             <div className="flex items-center bg-[#1e222b] border border-dashboard-border rounded-lg px-2 py-2" title="Kilos por Saco">
                               <Package className="w-4 h-4 text-gray-500 mr-1" />
                               <input 
                                 type="number" min="10" step="1"
                                 className="w-12 bg-transparent text-right text-gray-400 font-mono focus:outline-none"
                                 value={item.sackWeight || 60}
                                 onChange={(e) => handleUpdateBlend(index, 'sackWeight', parseInt(e.target.value) || 60)}
                               />
                               <span className="text-gray-500 ml-1 text-[10px] font-bold">kg</span>
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
                           </div>
                           <button type="button" onClick={() => handleRemoveOrigin(index)} className="text-gray-500 hover:text-red-400 p-2 transition-colors">
                             <Trash2 className="w-5 h-5" />
                           </button>
                          </div>
                        </div>
                       );
                     })}
                     
                     {newProfile.blend.length < 8 && (
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
                   </div>

                   {/* Real-time Blend Chart */}
                   <div className="flex-1 mt-auto flex items-end">
                      <div className="w-full h-[220px] bg-[#14161a] rounded-xl relative p-2 flex items-center justify-center border border-dashboard-border shadow-inner">

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
                  disabled={!isBlendValid || GREEN_ORIGINS.length === 0}
                  className={`flex-1 font-black uppercase tracking-widest py-5 px-6 rounded-xl transition-all shadow-xl
                    ${isBlendValid && GREEN_ORIGINS.length > 0
                      ? 'bg-coffee-accent hover:bg-coffee-light text-white shadow-[0_0_20px_rgba(217,119,6,0.3)]' 
                      : 'bg-[#14161a] border border-dashboard-border text-gray-600 cursor-not-allowed'}`}
                >
                  {editingProfileName ? 'Guardar Modificaciones' : 'Confirmar y Guardar Estándar'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setIsCreating(false);
                    setEditingProfileName(null);
                  }} 
                  className="px-10 bg-[#1e222b] hover:bg-dashboard-border text-gray-300 font-bold uppercase tracking-widest py-5 rounded-xl transition-all">
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
                if (newProfile.blend.length === 0 && GREEN_ORIGINS.length > 0) {
                   setNewProfile({...newProfile, blend: [{ origin: GREEN_ORIGINS[0], percentage: 100 }]});
                }
              }}
              className="bg-dashboard-panel border-2 border-dashed border-dashboard-border rounded-3xl p-8 min-h-[350px] flex flex-col items-center justify-center text-gray-500 hover:text-white hover:border-coffee-light hover:bg-[#1e222b] transition-all group shadow-sm"
            >
              <div className="bg-[#14161a] p-4 rounded-full mb-4 group-hover:scale-110 transition-transform shadow-inner">
                <Plus className="w-12 h-12 text-coffee-light" />
              </div>
              <h3 className="text-xl font-bold uppercase tracking-widest mt-2">Crear Gama / Módulo</h3>
              <p className="text-sm mt-3 text-center px-4 font-medium">Diseña la arquitectura de blend basándote en la base de orígenes estándar.</p>
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
                       <h3 className="text-xl font-black text-white truncate pr-4" title={profile?.name}>{profile?.name}</h3>
                       <div className="flex flex-wrap gap-2 mt-3">
                         <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${profile.businessUnit === 'LIDL' ? 'text-coffee-light bg-coffee-accent/10 border-coffee-accent/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/20'}`}>
                           {profile.businessUnit === 'LIDL' ? 'EXT: LIDL' : 'MARCA PROPIA'}
                         </span>
                         <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border ${profile.roastStrategy === 'PRE_BLEND' ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-orange-400 bg-orange-500/10 border-orange-500/20'}`}>
                           {profile.roastStrategy === 'PRE_BLEND' ? 'PRE-BLEND' : 'POST-BLEND'}
                         </span>

                         <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
                           AGTRON: {profile.agtron}
                         </span>
                       </div>
                     </div>
                     <div className="flex">
                       <button
                         onClick={() => {
                           setNewProfile(profile);
                           setEditingProfileName(profile?.name);
                           setIsCreating(true);
                           // Scroll to top
                           document.querySelector('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
                         }}
                         className="text-gray-500 hover:text-coffee-light p-2 transition-colors ml-2 bg-[#14161a] rounded-lg border border-dashboard-border hover:border-coffee-light/30"
                         title="Editar Gama"
                       >
                         <Edit2 className="w-4 h-4" />
                       </button>
                       <button
                         onClick={() => setProfileToDelete(i)}
                         className="text-gray-500 hover:text-red-400 p-2 transition-colors ml-2 bg-[#14161a] rounded-lg border border-dashboard-border hover:border-red-500/30"
                         title="Eliminar Gama"
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                     </div>
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
                onClick={async () => {
                  const targetProfile = masterProfiles[profileToDelete];
                  if (targetProfile) {
                    const isSuccess = await deleteMasterProfile(targetProfile.name);
                    if (!isSuccess) {
                      alert("Error: No se pudo eliminar la gama de la base de datos oficial. Verifica la conexión.");
                      return;
                    }
                  }
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
