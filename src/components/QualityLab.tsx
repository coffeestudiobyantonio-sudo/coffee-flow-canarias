import React, { useState, useEffect } from 'react';
import { TestTube2, CheckCircle, AlertTriangle, Target, LineChart as LineChartIcon, History, Lock } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceArea } from 'recharts';

import type { ActiveLot, DailyRoastOrder, MasterProfile } from '../App';

interface QualityLabProps {
  activeLot: ActiveLot | null;
  roastOrders: DailyRoastOrder[];
  onQualityValidated?: (taskId: string, isApproved: boolean) => void;
}

// Las tolerancias mecánicas (2% estricto Lidl, 8% flexibilidad Marca Propia)
const getTolerancePct = (bu?: 'LIDL' | 'PROPIA') => bu === 'LIDL' ? 0.02 : 0.08;

const QualityLab: React.FC<QualityLabProps> = ({ activeLot, roastOrders, onQualityValidated }) => {
  const pendingValidationTasks = roastOrders.flatMap(o => 
     o.tasks.map(t => ({ 
       ...t, 
       parentProfileName: o.profileName, 
       parentCategory: o.category,
       parentBusinessUnit: (t.masterProfile as unknown as MasterProfile)?.businessUnit || 'PROPIA'
     }))
  ).filter(t => t.status === 'ROASTED');

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(activeLot?.id || null);

  useEffect(() => {
    if (!selectedTaskId && pendingValidationTasks.length > 0) {
      setSelectedTaskId(pendingValidationTasks[0].id);
    }
  }, [pendingValidationTasks, selectedTaskId]);

  const currentTask = pendingValidationTasks.find(t => t.id === selectedTaskId);
  const activeProfile = (currentTask?.masterProfile as unknown as MasterProfile) || activeLot?.profile || null;

  const MASTER_PROFILE = activeProfile ? {
    fragrancia: activeProfile.sensory.fragrancia,
    aroma: activeProfile.sensory.aroma,
    sabor: activeProfile.sensory.sabor,
    cuerpo: activeProfile.sensory.cuerpo,
    agtron: activeProfile.agtron
  } : {
    fragrancia: 8.0,
    aroma: 7.5,
    sabor: 8.5,
    cuerpo: 8.0,
    agtron: 45
  };

  const [scores, setScores] = useState({
    fragrancia: MASTER_PROFILE.fragrancia,
    aroma: MASTER_PROFILE.aroma,
    sabor: MASTER_PROFILE.sabor,
    cuerpo: MASTER_PROFILE.cuerpo
  });

  const [agtron, setAgtron] = useState<number>(MASTER_PROFILE.agtron);
  const [validationState, setValidationState] = useState<'PENDING' | 'APPROVED' | 'REJECT'>('PENDING');

  useEffect(() => {
    if (activeProfile) {
      setScores({
        fragrancia: MASTER_PROFILE.fragrancia,
        aroma: MASTER_PROFILE.aroma,
        sabor: MASTER_PROFILE.sabor,
        cuerpo: MASTER_PROFILE.cuerpo,
      });
      setAgtron(MASTER_PROFILE.agtron);
      setValidationState('PENDING');
    }
  }, [activeProfile?.name, currentTask?.id]); 

  // Calcula si cada parámetro está dentro del margen de la Unidad de Negocio
  const ACTIVE_TOLERANCE_PCT = getTolerancePct(activeProfile?.businessUnit);
  const isPostBlend = activeProfile?.roastStrategy === 'POST_BLEND';
  const [currentOrigin, setCurrentOrigin] = useState<string>('Lote Único');

  useEffect(() => {
    if (activeProfile && isPostBlend) {
       setCurrentOrigin(activeProfile.blend[0]?.origin || 'Lote Único');
    } else {
       setCurrentOrigin('Lote Único');
    }
  }, [activeProfile, isPostBlend]);
  
  const isWithinTolerance = (val: number, target: number) => {
    if (!activeProfile) return false;
    const diff = Math.abs(val - target);
    return diff <= (target * ACTIVE_TOLERANCE_PCT);
  };

  const validations = {
    fragrancia: isWithinTolerance(scores.fragrancia, MASTER_PROFILE.fragrancia),
    aroma: isWithinTolerance(scores.aroma, MASTER_PROFILE.aroma),
    sabor: isWithinTolerance(scores.sabor, MASTER_PROFILE.sabor),
    cuerpo: isWithinTolerance(scores.cuerpo, MASTER_PROFILE.cuerpo),
    agtron: isWithinTolerance(agtron, MASTER_PROFILE.agtron)
  };

  const isApproved = Object.values(validations).every(v => v === true);

  useEffect(() => {
    if (activeProfile) {
      setValidationState(isApproved ? 'APPROVED' : 'REJECT');
    } else {
      setValidationState('PENDING');
    }
  }, [isApproved, activeProfile]);

  // Chart Data Preparation (Cebolla)
  const chartData = [
    { subject: 'Fragancia', A: scores.fragrancia, B: MASTER_PROFILE.fragrancia, fullMark: 10 },
    { subject: 'Aroma', A: scores.aroma, B: MASTER_PROFILE.aroma, fullMark: 10 },
    { subject: 'Sabor', A: scores.sabor, B: MASTER_PROFILE.sabor, fullMark: 10 },
    { subject: 'Cuerpo', A: scores.cuerpo, B: MASTER_PROFILE.cuerpo, fullMark: 10 },
  ];

  // Historical Mock Data for MDD Comparative Analytics
  const [historicalAgtron, setHistoricalAgtron] = useState<any[]>([]);
  useEffect(() => {
    if (activeProfile) {
       setHistoricalAgtron(Array.from({ length: 5 }).map((_, i) => ({
          batch: `L-${i + 1}-${Math.floor(Math.random() * 100)}`,
          agtron: MASTER_PROFILE.agtron + (Math.random() * (MASTER_PROFILE.agtron * ACTIVE_TOLERANCE_PCT * 2) - (MASTER_PROFILE.agtron * ACTIVE_TOLERANCE_PCT)),
          target: MASTER_PROFILE.agtron
       })).concat([{ batch: 'ACTUAL', agtron: agtron, target: MASTER_PROFILE.agtron }]));
    }
  }, [activeProfile, agtron, MASTER_PROFILE.agtron, ACTIVE_TOLERANCE_PCT]);

  const handleValidate = () => {
    if (onQualityValidated && currentTask) {
      onQualityValidated(currentTask.id, isApproved);
    }
  };

  return (
    <div className="flex w-full h-full bg-[#0a0a0b] text-white overflow-hidden font-sans">
      
      {/* Scrollable Layout */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-y-auto">
        
        {/* Left Column: Input Form (Tablet Friendly) */}
        <div className="w-full xl:w-[450px] bg-dashboard-panel border-r border-dashboard-border flex flex-col p-8">
          
          {/* VALIDATION QUEUE */}
          <div className="mb-2">
            <h3 className="text-sm font-bold text-gray-400 uppercase flex items-center mb-3">
              <History className="w-4 h-4 mr-2" />
              Lotes Pendientes de QA
            </h3>
            {pendingValidationTasks.length === 0 ? (
               <div className="bg-[#14161a] border border-dashed border-dashboard-border rounded-xl p-4 text-center">
                  <span className="text-gray-500 font-bold text-xs uppercase tracking-widest">No hay lotes en espera.</span>
               </div>
            ) : (
               <div className="flex space-x-3 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-dashboard-border scrollbar-track-transparent">
                  {pendingValidationTasks.map(t => (
                     <button
                       key={t.id}
                       onClick={() => setSelectedTaskId(t.id)}
                       className={`flex-none w-48 text-left p-3 rounded-xl border transition-all ${selectedTaskId === t.id ? 'bg-coffee-accent/10 border-coffee-light shadow-[inset_0_0_15px_rgba(217,119,6,0.1)]' : 'bg-[#1e222b] border-dashboard-border hover:border-gray-500 opacity-60'}`}
                     >
                       <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-black text-white truncate mr-2">{t.id}</span>
                          <span className="text-[9px] bg-[#14161a] border border-dashboard-border text-gray-300 px-1.5 rounded">{t.targetWeightKg}kg</span>
                       </div>
                       <div className="text-[9px] text-coffee-light/80 font-bold truncate">{t.parentProfileName}</div>
                     </button>
                  ))}
               </div>
            )}
          </div>

          <div className="flex justify-between items-center mb-8 border-b border-dashboard-border pb-6 mt-4">
            <div>
              <span className="text-xs text-coffee-accent font-black tracking-widest uppercase mb-1 flex items-center">
                <TestTube2 className="w-4 h-4 mr-2" />
                V2.1 - Lab de Calidad
              </span>
              <input 
                type="text" 
                className="bg-[#1e222b] border border-dashboard-border rounded-xl p-3 text-white font-mono text-lg focus:outline-none focus:border-purple-500 transition-colors w-64 mt-2"
                value={currentTask ? currentTask.id : ''}
                disabled={true}
                placeholder="--- ESPERANDO LOTE ---"
              />
            </div>
            <div className="text-right">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1">Régimen & Tolerancia</span>
              <span className={`px-2 py-1 rounded text-[10px] font-black tracking-widest uppercase border block mb-2 ${activeProfile?.businessUnit === 'LIDL' ? 'bg-coffee-accent/10 text-coffee-light border-coffee-accent/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'}`}>
                {activeProfile?.businessUnit === 'LIDL' ? 'ESTRICTO (2%)' : 'FLEXIBLE (8%)'}
              </span>
              <div className="flex items-center justify-end space-x-2">
                 {currentTask?.machineId && (
                   <span className="bg-purple-500/10 px-2 py-1 rounded border border-purple-500/30 text-purple-400 text-[10px] font-black uppercase shadow-sm flex items-center">
                     <Target className="w-3 h-3 mr-1" /> {currentTask.machineId}
                   </span>
                 )}
                 <span className="bg-[#1e222b] px-3 py-1 rounded border border-dashboard-border text-gray-300 text-xs font-bold shadow-sm">
                   {activeProfile ? activeProfile.name : 'Ninguno'}
                 </span>
                 {currentTask?.parentCategory && (
                    <span className={`px-2 py-1 rounded text-[10px] font-black tracking-widest uppercase border flex items-center shadow-sm ${currentTask.parentCategory === 'MARCA_PROPIA' ? 'bg-gradient-to-r from-yellow-600/30 to-yellow-800/30 text-yellow-500 border-yellow-500/50' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'}`}>
                      {currentTask.parentCategory === 'MARCA_PROPIA' ? <Lock className="w-3 h-3 mr-1" /> : <Target className="w-3 h-3 mr-1" />}
                      {currentTask.parentCategory === 'MARCA_PROPIA' ? 'MARCA PROPIA' : 'MDD EXTERNO'}
                    </span>
                 )}
              </div>
            </div>
          </div>

          {/* Display Blend Context from Gamas Engine */}
          {activeProfile && activeProfile.blend && (
            <div className="bg-[#14161a] border border-dashed border-dashboard-border rounded-xl p-3 flex flex-wrap gap-2 items-center mb-6">
               <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mr-2">Fórmula Base:</span>
               {activeProfile.blend.map((b, idx) => (
                 <span key={idx} className="text-xs bg-[#1e222b] text-gray-300 px-2 py-1 rounded border border-dashboard-border">
                   {b.origin} <span className="text-coffee-light font-mono font-bold ml-1">{b.percentage}%</span>
                 </span>
               ))}
            </div>
          )}

          {/* Origin Selector for Post-Blend */}
          {activeProfile && isPostBlend && (
            <div className="mb-6">
              <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2 block">Muestra Individual (Post-Blend Mode)</label>
              <div className="flex flex-wrap gap-2">
                {activeProfile.blend.map(b => (
                  <button 
                    key={b.origin}
                    onClick={() => setCurrentOrigin(b.origin)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${currentOrigin === b.origin ? 'bg-coffee-accent text-white border-coffee-light shadow-[0_0_15px_rgba(217,119,6,0.3)]' : 'bg-[#14161a] text-gray-400 border-dashboard-border hover:border-gray-500'}`}
                  >
                    {b.origin}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-2 italic flex items-center">
                 <AlertTriangle className="w-3 h-3 mr-1 text-amber-500" /> Laboratorio exige cata individual por cada origen antes del ensamblaje.
              </p>
            </div>
          )}

          <div className="space-y-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase flex items-center border-b border-dashboard-border pb-2">
              <Target className="w-4 h-4 mr-2" />
              Parámetros Sensoriales (+/- {ACTIVE_TOLERANCE_PCT * 100}%)
            </h3>
            <ScoreSlider label="Fragancia" value={scores.fragrancia} target={MASTER_PROFILE.fragrancia} isValid={validations.fragrancia} onChange={(v) => setScores({...scores, fragrancia: v})} disabled={!activeLot} />
            <ScoreSlider label="Aroma" value={scores.aroma} target={MASTER_PROFILE.aroma} isValid={validations.aroma} onChange={(v) => setScores({...scores, aroma: v})} disabled={!activeLot} />
            <ScoreSlider label="Sabor" value={scores.sabor} target={MASTER_PROFILE.sabor} isValid={validations.sabor} onChange={(v) => setScores({...scores, sabor: v})} disabled={!activeLot} />
            <ScoreSlider label="Cuerpo" value={scores.cuerpo} target={MASTER_PROFILE.cuerpo} isValid={validations.cuerpo} onChange={(v) => setScores({...scores, cuerpo: v})} disabled={!activeLot} />
            
            <h3 className="text-sm font-bold text-gray-400 uppercase flex items-center border-b border-dashboard-border pb-2 pt-4">
              <LineChartIcon className="w-4 h-4 mr-2" />
              Colorimetría (Critical)
            </h3>
            <div className="mb-4">
               <div className="flex justify-between items-center mb-2">
                 <span className="text-sm font-bold text-gray-300">Target Agtron</span>
                 <div className="flex items-center space-x-3">
                   <div className="text-[10px] bg-[#1e222b] px-2 py-1 rounded text-gray-400">TGT: {MASTER_PROFILE.agtron.toFixed(1)}</div>
                   <span className={`font-mono text-xl font-bold ${validations.agtron ? 'text-purple-400' : 'text-red-400'}`}>
                     {agtron.toFixed(1)}
                   </span>
                 </div>
               </div>
               <input 
                 type="range" min="30" max="80" step="0.5"
                 value={agtron}
                 onChange={(e) => setAgtron(parseFloat(e.target.value))}
                 className={`w-full h-4 bg-[#14161a] rounded-lg appearance-none cursor-pointer ${validations.agtron ? 'accent-purple-500' : 'accent-red-500'}`}
                 disabled={!activeLot}
               />
            </div>
            
            {/* Feedback Loop para Post-Blend */}
            {activeProfile && isPostBlend && (
              <div className="mt-8 border-t border-dashboard-border pt-6">
                <h3 className="text-sm font-bold text-gray-400 uppercase flex items-center mb-4">
                  <Target className="w-4 h-4 mr-2" />
                  Ajuste de Proporción (Feedback Loop)
                </h3>
                <div className="space-y-2">
                  {activeProfile.blend.map(b => (
                    <div key={b.origin} className="flex items-center justify-between bg-[#14161a] p-2 rounded-lg border border-dashboard-border">
                      <span className="text-xs font-bold text-gray-300">{b.origin}</span>
                      <div className="flex items-center space-x-2">
                        <input 
                          type="number" 
                          defaultValue={b.percentage} 
                          className="w-16 bg-[#1e222b] border border-dashboard-border rounded px-2 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-purple-500" 
                        />
                        <span className="text-xs text-gray-500">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-purple-400/70 mt-3 leading-tight italic">Si detectas que un origen dominó la taza durante la cata individual, ajusta su ratio aquí para corregir el ensamblaje final.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Visualization & Status */}
        <div className="flex-1 bg-[#14161a] p-8 flex flex-col relative">
          
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black tracking-widest uppercase text-gray-300">
              Analítica Comparativa MDD: <span className="text-purple-400">"{currentOrigin}"</span>
            </h2>
            <div className="flex items-center text-xs font-bold uppercase tracking-widest text-gray-500 bg-[#1e222b] px-3 py-1.5 rounded-lg border border-dashboard-border">
              <History className="w-4 h-4 mr-2" /> Tendencia (Últimos 6 Lotes)
            </div>
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6 flex-1 min-h-[400px]">
             
             {/* Radar Chart: Sensory Drift */}
             <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 flex flex-col relative overflow-hidden group">
               <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4 border-b border-dashboard-border pb-2">Desviación Sensorial (Radar)</h3>
               <div className="flex-1 w-full relative">
                 <ResponsiveContainer width="100%" height="100%">
                   <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
                     <PolarGrid stroke="#2e3340" />
                     <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 'bold' }} />
                     
                     {/* Sombra del Maestro (Ideal) */}
                     <Radar name="Golden Standard" dataKey="B" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" fill="#9ca3af" fillOpacity={0.1} />
                     
                     {/* Línea actual del lote (Cata real) */}
                     <Radar name="Lote Actual" dataKey="A" stroke={isApproved ? '#a855f7' : '#ef4444'} strokeWidth={3} fill={isApproved ? '#a855f7' : '#ef4444'} fillOpacity={0.3} />
                     
                     <Tooltip contentStyle={{ backgroundColor: '#1e222b', borderColor: '#2e3340', color: '#fff', borderRadius: '8px' }} itemStyle={{ fontWeight: 'bold' }} />
                     <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '10px' }} />
                   </RadarChart>
                 </ResponsiveContainer>
               </div>
             </div>

             {/* Line Chart: Agtron Trend */}
             <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 flex flex-col relative overflow-hidden group">
               <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4 border-b border-dashboard-border pb-2 flex justify-between items-center">
                 <span>Tendencia Colorimetría (Agtron)</span>
                 <span className="text-[9px] bg-[#1e222b] px-2 py-0.5 rounded text-purple-400 border border-purple-500/20">TOLERANCIA ±{ACTIVE_TOLERANCE_PCT * 100}%</span>
               </h3>
               <div className="flex-1 w-full relative">
                 <ResponsiveContainer width="100%" height="100%">
                   <LineChart data={historicalAgtron} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" />
                     <XAxis dataKey="batch" stroke="#6b7280" tick={{ fontSize: 10, fontWeight: 'bold' }} />
                     <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} domain={['dataMin - 2', 'dataMax + 2']} />
                     <Tooltip 
                       contentStyle={{ backgroundColor: '#1e222b', borderColor: '#2e3340', color: '#fff', borderRadius: '8px' }} 
                       labelStyle={{ color: '#9ca3af', fontWeight: 'bold', marginBottom: '4px' }}
                     />
                     
                     {/* Tolerance Band (Golden Standard) */}
                     <ReferenceArea 
                        y1={MASTER_PROFILE.agtron * (1 - ACTIVE_TOLERANCE_PCT)} 
                        y2={MASTER_PROFILE.agtron * (1 + ACTIVE_TOLERANCE_PCT)} 
                        fill="#a855f7" 
                        fillOpacity={0.05} 
                     />
                     
                     <Line type="step" dataKey="target" name="Target MDD" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                     <Line type="monotone" dataKey="agtron" name="Color Obtenido" stroke={validations.agtron ? "#a855f7" : "#ef4444"} strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                   </LineChart>
                 </ResponsiveContainer>
               </div>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-8">
            {/* Status Indicator */}
            <div className={`border rounded-2xl p-6 flex flex-col items-center justify-center transition-all bg-dashboard-panel
               ${validationState === 'APPROVED' ? 'border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.1)]' : 
                 validationState === 'REJECT' ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.1)]' : 'border-dashboard-border'}`}>
               
               {validationState === 'APPROVED' ? (
                 <>
                   <CheckCircle className="w-10 h-10 text-green-400 mb-2" />
                   <div className="text-center font-bold text-green-400">PERFIL EXACTO</div>
                   <div className="text-center text-xs text-green-500/70">Dentro del {ACTIVE_TOLERANCE_PCT * 100}%</div>
                 </>
               ) : validationState === 'REJECT' ? (
                 <>
                   <AlertTriangle className="w-10 h-10 text-red-400 mb-2" />
                   <div className="text-center font-bold text-red-400">LOTE FUERA DE PERFIL</div>
                   <div className="text-center text-xs text-red-500/70">Rechazar a Mermas</div>
                 </>
               ) : (
                 <>
                   <Target className="w-10 h-10 text-gray-400 mb-2" />
                   <div className="text-center font-bold text-gray-400">ESPERANDO CATA</div>
                   <div className="text-center text-xs text-gray-500/70">Selecciona un Lote de la Cola</div>
                 </>
               )}
            </div>

            {/* Validation Action Button */}
            <div className="relative border rounded-2xl border-dashboard-border bg-dashboard-panel flex flex-col p-4 justify-center items-center overflow-hidden">
              {!currentTask ? (
                <div className="text-center text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-2 px-2">
                  Selecciona un lote de la cola superior para habilitar el registro de calidad.
                </div>
              ) : (
                <button 
                  onClick={handleValidate}
                  className={`w-full h-full py-4 rounded-xl font-black text-sm tracking-widest uppercase transition-all shadow-xl flex items-center justify-center text-center px-2
                    ${validationState === 'APPROVED' 
                      ? 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_20px_rgba(22,163,74,0.4)] hover:shadow-[0_0_25px_rgba(34,197,94,0.6)]' 
                      : 'bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:shadow-[0_0_25px_rgba(239,68,68,0.6)]'}`}
                >
                  {validationState === 'APPROVED' ? (
                    <><CheckCircle className="w-5 h-5 mr-3 flex-shrink-0" /> APROBAR Y<br/>SELLAR LOTE</>
                  ) : (
                    <><AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" /> REGISTRAR COMO<br/>MERMA (RECHAZO)</>
                  )}
                </button>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};

// Sub-component for Sliders
const ScoreSlider = ({ label, value, target, isValid, onChange, disabled }: { label: string, value: number, target: number, isValid: boolean, onChange: (v: number) => void, disabled: boolean }) => (
  <div className="mb-4 group">
    <div className="flex justify-between items-center mb-1">
      <span className="text-sm font-bold text-gray-300">{label}</span>
      <div className="flex items-center space-x-3">
        <div className="text-[10px] bg-[#1e222b] px-2 py-1 rounded text-gray-400 border border-dashboard-border group-hover:border-purple-500/30 transition-colors">TGT: {target.toFixed(1)}</div>
        <span className={`font-mono text-lg font-bold ${isValid ? 'text-purple-400' : 'text-red-400'}`}>
          {value.toFixed(1)}
        </span>
      </div>
    </div>
    <input 
      type="range" min="6.0" max="10.0" step="0.1"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={`w-full h-3 bg-[#14161a] rounded-lg appearance-none cursor-pointer border border-transparent 
        ${isValid ? 'accent-purple-500 group-hover:border-purple-500/20' : 'accent-red-500 group-hover:border-red-500/20'}`}
      disabled={disabled}
    />
  </div>
);

export default QualityLab;
