import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, TrendingUp, AlertCircle, Flame, Timer as TimerIcon, BarChart3, CheckCircle, QrCode, Wrench, History, ArchiveRestore, TestTube2, Info, Database, Lock, Target } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot, CartesianGrid } from 'recharts';
import type { MasterProfile } from '../App';
import { ROASTING_MACHINES } from '../App';

interface RoastDataPoint {
  time: number; // seconds
  temp: number;
  type?: 'CHARGE' | 'TP' | 'YELLOW' | 'FC_START' | 'FC_END' | 'DROP' | 'EVENT';
  note?: string;
}

interface ManualRoastControlProps {
  activeLot: any;
  onBatchComplete: (actualWeight: number) => void;
  allOrders: any[];
  setAllOrders: React.Dispatch<React.SetStateAction<any[]>>;
  silos: any[];
  setSilos: React.Dispatch<React.SetStateAction<any[]>>;
}

const ManualRoastControl: React.FC<ManualRoastControlProps> = ({ activeLot, onBatchComplete, allOrders, setAllOrders, silos, setSilos }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0); // in seconds
  const [dataPoints, setDataPoints] = useState<RoastDataPoint[]>([]);
  const [currentTemp, setCurrentTemp] = useState<string>("");
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [showFinalReport, setShowFinalReport] = useState(false);
  const [finalWeight, setFinalWeight] = useState<string>("");
  const [agtronColor, setAgtronColor] = useState<string>("");
  const [roastCount, setRoastCount] = useState(0);
  const [bbpTimeLeft, setBbpTimeLeft] = useState<number>(0);

  // Artisan 2.0 - New UX State
  const [chargeTempInput, setChargeTempInput] = useState<string>("150");
  const [checklist, setChecklist] = useState({ silo: false, coffee: false, temp: false, discharge: false });
  const [selectedSiloId, setSelectedSiloId] = useState<number | null>(null);
  const [inputMoisture, setInputMoisture] = useState<string>("");
  const [pendingMilestone, setPendingMilestone] = useState<{ type: RoastDataPoint['type'], time: number } | null>(null);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [consistencyAlert, setConsistencyAlert] = useState<string | null>(null);
  const [showStaleAlert, setShowStaleAlert] = useState(false);
  const [showBlendingOverlay, setShowBlendingOverlay] = useState(false);
  const [finalMixWeight, setFinalMixWeight] = useState<string>("");
  const [showSamplePrompt, setShowSamplePrompt] = useState(false);
  const [shrinkageJustification, setShrinkageJustification] = useState<string>("");
  const [showShrinkageAlert, setShowShrinkageAlert] = useState(false);
  const [consistencyScore, setConsistencyScore] = useState<number>(0);

  const timerRef = useRef<any>(null);

  // Stopwatch Logic
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRunning]);

  // BBP Countdown Logic
  useEffect(() => {
    let bbpInterval: any;
    if (bbpTimeLeft > 0) {
      bbpInterval = setInterval(() => {
        setBbpTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(bbpInterval);
  }, [bbpTimeLeft]);

  // Phase 11: Auto-Lock Silo Check
  useEffect(() => {
    if (activeLot?.assignedSilos && activeLot.assignedSilos.length > 0) {
       const sId = activeLot.assignedSilos[0];
       setSelectedSiloId(sId);
       const silo = silos.find(s => s.id === sId);
       if (silo && silo.moisture) setInputMoisture(silo.moisture.toString());
       
       // Phase 16: Auto-Validate all checks when coming from Operator Hub
       setChecklist({ silo: true, coffee: true, temp: true, discharge: true });

       if (silo && silo.lastFillDate) {
          const daysOld = (Date.now() - new Date(silo.lastFillDate).getTime()) / (1000 * 60 * 60 * 24);
          if (daysOld > 5) {
             setShowStaleAlert(true);
          } else {
             setShowStaleAlert(false);
          }
       }
    } else {
       setSelectedSiloId(null);
       setChecklist(prev => ({ ...prev, silo: false }));
       setShowStaleAlert(false);
    }
  }, [activeLot]);

  const formatTimeMinutes = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Add Data Point
  const handleAddTemp = (tempOverride?: number, type?: RoastDataPoint['type'], time?: number) => {
    const tempToBound = tempOverride || parseFloat(currentTemp);
    if (isNaN(tempToBound)) return;

    const timestamp = time !== undefined ? time : elapsedTime;

    const newPoint: RoastDataPoint = {
      time: timestamp,
      temp: tempToBound,
      type
    };

    // Consistency Alert Check (Example for TP) - Artisan 2.0 Improvement D
    if (type === 'TP') {
      const HISTORICAL_TP_AVG = 95;
      if (Math.abs(tempToBound - HISTORICAL_TP_AVG) > 5) {
        setConsistencyAlert(`Desviación T.P. detectada: ${tempToBound.toFixed(1)}°C (Rango esperado: ${HISTORICAL_TP_AVG-5}-${HISTORICAL_TP_AVG+5})`);
        setTimeout(() => setConsistencyAlert(null), 8000);
      }
    }

    setDataPoints(prev => [...prev, newPoint].sort((a, b) => a.time - b.time));
    setCurrentTemp("");
  };

  const handleStartRoast = () => {
    if (bbpTimeLeft > 0) {
       if (!window.confirm(`⚠️ BBP ACTIVO: La máquina aún está disipando calor. ¿Ignorar seguridad y cargar ahora? (Peligro de tueste desigual)`)) {
          return;
       }
    }

    const startTemp = parseFloat(chargeTempInput);
    if (isNaN(startTemp)) {
      alert("Introduce una temperatura de carga válida.");
      return;
    }

    const selectedSilo = silos.find(s => s.id === selectedSiloId);
    if (!selectedSilo || selectedSilo.currentKg < (activeLot?.batchWeight || ROASTING_MACHINES[1].maxCapacity)) {
      alert(`⚠️ El Silo ${selectedSiloId} no tiene suficiente stock para esta tostada (${activeLot?.batchWeight || ROASTING_MACHINES[1].maxCapacity}kg requeridos).`);
      return;
    }
    
    setIsRunning(true);
    setElapsedTime(0);
    setDataPoints([{ time: 0, temp: startTemp, type: 'CHARGE' }]);
    
    // Simulate Consistency Baseline for MDD
    if (activeLot?.profile?.businessUnit === 'LIDL') {
       setConsistencyScore(Math.floor(Math.random() * 5) + 95); // Mock 95-100%
    }
  };

  const openMilestoneModal = (type: RoastDataPoint['type']) => {
    if (!isRunning) return;
    // Capture time immediately (Artisan 2.0 Improvement A)
    setPendingMilestone({ type, time: elapsedTime });
    setShowMilestoneModal(true);
  };

  const handleConfirmMilestone = (temp: number) => {
    if (pendingMilestone) {
      handleAddTemp(temp, pendingMilestone.type, pendingMilestone.time);
      setPendingMilestone(null);
      setShowMilestoneModal(false);
    }
  };

  const handleStop = () => {
    setIsRunning(false);
    
    const finalWeightVal = parseFloat(finalWeight);
    const targetWeightVal = activeLot?.batchWeight || 0;
    const shrinkage = targetWeightVal > 0 ? (1 - finalWeightVal / targetWeightVal) * 100 : 0;
    
    if (shrinkage > 15) {
       setShowShrinkageAlert(true);
    }
    
    setShowFinalReport(true);
    // Auto-log field at stop
    const lastTemp = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].temp : 220;
    handleAddTemp(lastTemp, 'DROP', elapsedTime);
  };

  // Calculate RoR
  const calculateRoR = () => {
    if (dataPoints.length < 2) return 0;
    const last = dataPoints[dataPoints.length - 1];
    const prev = dataPoints[dataPoints.length - 2];
    const timeDiff = (last.time - prev.time) / 60; // in minutes
    if (timeDiff === 0) return 0;
    return parseFloat(((last.temp - prev.temp) / timeDiff).toFixed(1));
  };

  // Phase Ratio Logic (Artisan 2.0 Improvement B)
  const calculatePhaseRatios = () => {
    const charge = dataPoints.find(p => p.type === 'CHARGE');
    const yellow = dataPoints.find(p => p.type === 'YELLOW');
    const brown = dataPoints.find(p => p.type === 'FC_START' || p.type === 'EVENT'); // Using EVENT as fallback
    
    const totalSeconds = isRunning ? elapsedTime : (dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].time : 1);
    if (totalSeconds === 0) return { drying: "0", maillard: "0", development: "0" };

    const dryingTime = yellow && charge ? yellow.time - charge.time : (yellow ? yellow.time : 0);
    const maillardTime = brown && yellow ? brown.time - yellow.time : 0;
    const developmentTime = brown ? totalSeconds - brown.time : 0;

    return {
      drying: ((dryingTime / totalSeconds) * 100).toFixed(0),
      maillard: ((maillardTime / totalSeconds) * 100).toFixed(0),
      development: ((developmentTime / totalSeconds) * 100).toFixed(0)
    };
  };

  const ratios = calculatePhaseRatios();

  // Visual Progress Color Logic (Artisan 2.0 Improvement C)
  const getProgressColor = () => {
    if (!isRunning && dataPoints.length === 0) return 'bg-gray-700';
    if (dataPoints.some(p => p.type === 'FC_START')) return 'bg-orange-800'; // Development
    if (dataPoints.some(p => p.type === 'YELLOW')) return 'bg-amber-900'; // Maillard
    if (isRunning) return 'bg-yellow-600'; // Drying
    return 'bg-gray-700';
  };

  const handleFinalizeBatch = () => {
    const weight = parseFloat(finalWeight);
    
    // Calculate BBP Cooldown based on machine inertia
    const machine = ROASTING_MACHINES.find(m => m.id === activeLot?.machineId) || ROASTING_MACHINES[1];
    const cooldownSeconds = machine.bbpCooldownBase + (weight * machine.bbpCoefficient);
    setBbpTimeLeft(Math.round(cooldownSeconds));

    // Deduct from Silo
    if (selectedSiloId) {
      setSilos(prev => prev.map(s => s.id === selectedSiloId ? { ...s, currentKg: Math.max(0, s.currentKg - (activeLot?.batchWeight || machine.maxCapacity)) } : s));
    }

    // Handle Post-Batch Logic
    const parentOrder = allOrders.find(o => o.id === activeLot?.parentOrderId);
    const isLastBatchOfOrder = parentOrder && parentOrder.tasks
      .filter((t: any) => t.type === 'ROAST')
      .every((t: any) => t.status === 'ROASTED' || t.id === activeLot.id);

    if (isLastBatchOfOrder && parentOrder.roastStrategy === 'POST_BLEND') {
       // Trigger Blending Workflow
       setShowFinalReport(false);
       setShowBlendingOverlay(true);
    } else {
       onBatchComplete(weight);
       setShowFinalReport(false);
       setRoastCount(prev => prev + 1);
       if (roastCount + 1 >= 5) setShowMaintenance(true);
    }
  };

  const handleConfirmMix = () => {
    if (!finalMixWeight) {
      alert("Por favor, introduce el Peso Total de la Mezcla Final.");
      return;
    }
    // Update parent order status to COMPLETED and tasks to ROASTED
    setAllOrders(prev => prev.map(o => o.id === activeLot?.parentOrderId ? { ...o, status: 'COMPLETED' } : o));
    setShowBlendingOverlay(false);
    setShowSamplePrompt(true);
  };

  const currentOrder = allOrders.find(o => o.id === activeLot?.parentOrderId);
  const roastTasks = currentOrder?.tasks.filter((t: any) => t.type === 'ROAST') || [];
  const completedRoasts = roastTasks.filter((t: any) => t.status === 'ROASTED').length;
  const mixProgress = roastTasks.length > 0 ? Math.round((completedRoasts / roastTasks.length) * 100) : 0;
  
  // Resting Timer Logic (20 min = 1200s)
  const lastRoastTime = Math.max(...roastTasks.map((t: any) => t.roastedAt || 0));
  const restingTimeElapsed = Math.floor((Date.now() - lastRoastTime) / 1000);
  const restingTimeRemaining = Math.max(0, 1200 - restingTimeElapsed);

  const currentMachine = ROASTING_MACHINES.find(m => m.id === activeLot?.machineId) || ROASTING_MACHINES[1];
  const machineSpecificProfile = activeLot?.profile?.machineProfiles?.[currentMachine.id];
  const ghostCurve = machineSpecificProfile?.ghostCurve || [];
  const targetAgtron = machineSpecificProfile?.targetAgtron || activeLot?.profile?.agtron || 50;

  const currentRoR = calculateRoR();

  return (
    <div className="p-6 bg-[#0f1114] min-h-full text-white font-sans overflow-hidden">
      
      {/* Visual Indicator Corner HUD (Phase 9) */}
      {selectedSiloId && isRunning && (
        <div className="absolute top-6 left-6 z-50 bg-[#14161a]/95 backdrop-blur-md border border-blue-500/30 rounded-2xl p-4 flex items-center shadow-2xl ring-1 ring-blue-500/20">
           <Database className="w-8 h-8 text-blue-400 mr-4" />
           <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Silo {selectedSiloId} (Origen)</span>
              <span className="text-xl font-black text-white">{silos.find(s => s.id === selectedSiloId)?.currentKg} <span className="text-[10px] text-gray-500">KG</span></span>
           </div>
           <div className="ml-6 pl-6 border-l border-white/10 flex flex-col items-end">
              <span className="text-[10px] font-bold text-coffee-light uppercase">En Tueste</span>
              <span className="text-xl font-black text-coffee-light">-{activeLot?.batchWeight || currentMachine.maxCapacity} KG</span>
           </div>
        </div>
      )}

      {/* Artisan 2.0 Header */}
      <div className={`flex justify-between items-start mb-6 ${selectedSiloId && isRunning ? 'pt-14' : ''}`}>
        <div className="flex-1">
          <h1 className="text-3xl font-black text-white flex items-center tracking-tighter">
            <Flame className="w-8 h-8 mr-3 text-coffee-accent animate-pulse" />
            TOSTADOR <span className="text-coffee-light ml-2">CONTROL</span>
          </h1>
          <div className="flex items-center mt-1 space-x-3">
             {activeLot?.category === 'MARCA_PROPIA' ? (
                <span className="px-3 py-1 bg-gradient-to-r from-yellow-600/30 to-yellow-800/30 text-yellow-500 text-[10px] font-black rounded uppercase tracking-widest border border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.2)] flex items-center">
                   <Lock className="w-3 h-3 mr-1.5" /> MARCA PROPIA
                </span>
             ) : activeLot?.category === 'MDD' ? (
                <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-[10px] font-black rounded uppercase tracking-widest border border-blue-500/30 flex items-center">
                   <Target className="w-3 h-3 mr-1.5" /> MDD EXTERNO
                </span>
             ) : (
                <span className="px-2 py-0.5 bg-coffee-accent/20 text-coffee-accent text-[10px] font-black rounded uppercase tracking-widest border border-coffee-accent/30 flex items-center">
                   <AlertCircle className="w-3 h-3 mr-1.5" /> Précision Chirurgicale
                </span>
             )}
             <div className="flex flex-col">
                <p className="text-sm text-gray-400 font-bold uppercase tracking-wider">
                  {activeLot ? `Perfil: ${activeLot.profile.name}` : 'MODO SIMULACIÓN'}
                </p>
                {activeLot?.batchIndex && (
                  <p className="text-[10px] text-coffee-light font-black uppercase tracking-[0.2em] mt-0.5">
                    Batch {activeLot.batchIndex} de {activeLot.totalBatches} ({activeLot.orderTotalKg}kg Total)
                  </p>
                )}
             </div>
          </div>
        </div>
        
        {/* Visual Progress Bar (Artisan 2.0 Improvement C) */}
        <div className="flex-1 flex flex-col max-w-xl mx-8 mt-2">
            {currentOrder?.roastStrategy === 'POST_BLEND' && (
              <div className="flex justify-between items-center mb-1">
                 <span className="text-[10px] font-black text-coffee-light uppercase tracking-widest flex items-center">
                    <History className="w-3 h-3 mr-1" /> Estado de Mezcla: {mixProgress}%
                 </span>
                 <span className="text-[9px] text-gray-500 font-bold uppercase">{completedRoasts}/{roastTasks.length} Tuestes</span>
              </div>
            )}
            <div className="flex justify-between mb-2 px-1">
               <span className={`text-[10px] font-black uppercase ${isRunning ? 'text-yellow-500' : 'text-gray-600'}`}>Secado</span>
               <span className={`text-[10px] font-black uppercase ${dataPoints.some(p => p.type === 'YELLOW') ? 'text-amber-600' : 'text-gray-600'}`}>Maillard</span>
               <span className={`text-[10px] font-black uppercase ${dataPoints.some(p => p.type === 'FC_START') ? 'text-orange-700' : 'text-gray-600'}`}>Desarrollo</span>
            </div>
            <div className="h-5 w-full bg-black/40 rounded-full overflow-hidden border border-white/5 p-1 shadow-inner">
               <div 
                 className={`h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(217,119,6,0.2)] ${getProgressColor()}`} 
                 style={{ width: isRunning ? `${Math.min((elapsedTime / 600) * 100, 100)}%` : (dataPoints.length > 0 ? '100%' : '0%') }}
               ></div>
            </div>
        </div>

        <div className="text-right flex items-center space-x-6">
           {activeLot?.profile?.businessUnit === 'LIDL' && (
              <div className="bg-[#14161a] border border-blue-500/30 px-4 py-2 rounded-2xl flex items-center space-x-4 shadow-xl shadow-blue-500/5 ring-1 ring-blue-500/20">
                 <div className="relative w-12 h-12 flex items-center justify-center">
                    <svg className="w-12 h-12 -rotate-90">
                       <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(59, 130, 246, 0.1)" strokeWidth="4" />
                       <circle cx="24" cy="24" r="20" fill="none" stroke="#3b82f6" strokeWidth="4" strokeDasharray={126} strokeDashoffset={126 * (1 - consistencyScore / 100)} strokeLinecap="round" className="transition-all duration-1000" />
                    </svg>
                    <span className="absolute text-[10px] font-black text-white">{consistencyScore}%</span>
                 </div>
                 <div className="flex flex-col">
                    <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">MDD Consistency</span>
                    <span className="text-[10px] font-bold text-gray-400">vs. Target Curve</span>
                 </div>
              </div>
           )}
           <div className="text-right">
              <p className="text-[10px] text-gray-500 font-black uppercase">Capacidad de Tueste</p>
              <p className="text-xl font-black text-white">{activeLot?.batchWeight || currentMachine.maxCapacity} <span className="text-xs text-gray-500">KG</span></p>
              <p className="text-[10px] text-coffee-light font-bold uppercase tracking-tighter">{currentMachine.name}</p>
           </div>
        </div>
      </div>

      {/* Artisan 2.0 - Consistency Alert Overlay (Improvement D) */}
      {consistencyAlert && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-red-600 text-white px-8 py-4 rounded-2xl shadow-[0_0_50px_rgba(220,38,38,0.5)] flex items-center space-x-4 animate-bounce border-2 border-white/20">
           <AlertCircle className="w-8 h-8" />
           <p className="text-lg font-black uppercase tracking-tight">{consistencyAlert}</p>
        </div>
      )}

      {/* PHASE 0: Pre-Roast Configuration */}
      {!isRunning && dataPoints.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full max-w-5xl mx-auto py-10">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 w-full items-center">
              
              {/* Left: Check de Preparación */}
              <div className="bg-[#14161a] p-10 rounded-[48px] border border-white/5 shadow-2xl space-y-6">
                 <h2 className="text-2xl font-black text-white uppercase tracking-tight border-b border-white/5 pb-4">
                    {activeLot ? `Check de Verificación: ${activeLot.id}` : 'Check de Preparación'}
                 </h2>

                 {/* Silo Selection (Phase 11 Auto-Locking) */}
                 <div className="bg-[#1e222b] p-4 rounded-2xl border border-dashboard-border mb-4 relative z-20">
                   <label className="text-xs font-black text-blue-400 uppercase tracking-widest mb-2 flex items-center">
                     <Database className="w-4 h-4 mr-2" /> 1. Silo Asignado (Hub)
                   </label>
                   
                   {activeLot?.assignedSilos?.length ? (
                      <div className="w-full bg-[#0f1114] border border-blue-500/50 rounded-xl p-3 flex justify-between items-center opacity-80 cursor-not-allowed mb-3 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
                         <span className="text-white font-black uppercase tracking-widest text-[11px]">
                           SILO {activeLot.assignedSilos[0]} — {silos.find(s => s.id === activeLot.assignedSilos![0])?.origin || 'ORIGEN DESCONOCIDO'}
                         </span>
                         <Lock className="w-4 h-4 text-blue-500 line-through" />
                      </div>
                   ) : (
                       <select
                         value={selectedSiloId || ''}
                         onChange={(e) => {
                           const sId = parseInt(e.target.value);
                           setSelectedSiloId(sId);
                           const silo = silos.find(s => s.id === sId);
                           if (silo && silo.moisture) setInputMoisture(silo.moisture.toString());
                           setChecklist(prev => ({ ...prev, silo: true }));
                         }}
                         className="w-full bg-[#14161a] border border-dashboard-border rounded-xl p-3 text-white font-bold appearance-none outline-none focus:border-blue-500 mb-3"
                       >
                         <option value="" disabled>Selecciona Silo libre...</option>
                         {silos.filter(s => s.currentKg > 0).map(s => (
                           <option key={s.id} value={s.id}>Silo {s.id} - {s.origin} ({s.currentKg} kg)</option>
                         ))}
                       </select>
                   )}
                   
                   <div className="flex flex-col space-y-3">
                     <div className="flex items-center justify-between">
                       <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block">Humedad Entrada (%)</label>
                       <input 
                         disabled={!!activeLot?.assignedSilos?.length} 
                         type="number" step="0.1" value={inputMoisture} 
                         onChange={e => setInputMoisture(e.target.value)} 
                         className="w-24 bg-[#14161a] rounded-lg p-2 text-white font-mono text-sm border border-dashboard-border focus:border-coffee-light outline-none disabled:opacity-50 text-right" placeholder="11.0" 
                       />
                     </div>
                     {showStaleAlert && (
                       <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-lg text-[10px] text-orange-400 uppercase font-black tracking-widest flex items-start shadow-inner">
                         <AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" /> ATENCIÓN: CAFÉ EXTIENDE 5 DÍAS EN TOLVA SUPERIOR. VERIFIQUE MERMA DE HUMEDAD ANTES DEL TUESTE LIMITANDO TEMPERATURA INICIAL.
                       </div>
                     )}
                   </div>
                 </div>

                 <div className="space-y-4">
                    <CheckItem 
                      label={`2. Café verde (${activeLot?.batchWeight || '---'} kg) descargado`} 
                      checked={checklist.coffee} 
                      onChange={() => setChecklist(prev => ({ ...prev, coffee: !prev.coffee }))} 
                    />
                    <CheckItem 
                      label={`Máquina en ${chargeTempInput}°C (Termostato OK)`} 
                      checked={checklist.temp} 
                      onChange={() => setChecklist(prev => ({ ...prev, temp: !prev.temp }))} 
                    />
                    <CheckItem 
                      label="4. Destino de descarga despejado" 
                      checked={checklist.discharge} 
                      onChange={() => setChecklist(prev => ({ ...prev, discharge: !prev.discharge }))} 
                    />
                 </div>
              </div>

              {/* Right: Input Temp & Start */}
              <div className="flex flex-col items-center space-y-10">
                 <div className="bg-[#14161a] p-10 rounded-[48px] border border-white/5 shadow-2xl ring-1 ring-white/5 flex flex-col items-center w-full">
                    <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Charge Temp (°C)</p>
                    <input 
                      type="number" 
                      value={chargeTempInput}
                      onChange={(e) => setChargeTempInput(e.target.value)}
                      className="bg-transparent text-8xl font-black text-coffee-light outline-none text-center w-full focus:scale-105 transition-transform"
                      placeholder="150"
                    />
                 </div>

                 <button 
                   onClick={handleStartRoast}
                   disabled={!checklist.silo || !checklist.coffee || !checklist.temp || !checklist.discharge}
                   className={`group relative w-full h-32 rounded-[32px] font-black text-4xl uppercase tracking-tighter transition-all shadow-2xl flex items-center justify-center border-b-8 
                     ${(!checklist.silo || !checklist.coffee || !checklist.temp || !checklist.discharge) 
                       ? 'bg-gray-800 text-gray-600 border-gray-900 cursor-not-allowed opacity-50' 
                       : 'bg-green-600 hover:bg-green-500 text-white border-green-800 hover:scale-105 active:scale-95 active:border-b-0'}`}
                 >
                    <Play className={`w-10 h-10 mr-4 ${(!checklist.silo || !checklist.coffee || !checklist.temp || !checklist.discharge) ? '' : 'fill-current'}`} /> 
                    START ROAST
                 </button>
              </div>
           </div>
        </div>
      ) : (
        /* PHASE 1: Active Roasting / Review */
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-180px)]">
          
          {/* Left: Milestones & Ratios */}
          <div className="col-span-12 lg:col-span-3 flex flex-col space-y-6 overflow-y-auto pr-2 custom-scrollbar">
            
            {/* One-Touch Milestone Buttons (Improvement A) */}
            <div className="bg-[#14161a] p-6 rounded-[32px] border border-white/5 shadow-xl space-y-4">
               <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Registro Instantáneo</h3>
               
               <QuickStageButton 
                 label="Turning Point" 
                 icon={<TrendingUp className="w-6 h-6" />}
                 active={dataPoints.some(p => p.type === 'TP')}
                 onClick={() => openMilestoneModal('TP')}
                 color="border-green-500/30 text-green-400 bg-green-500/5"
               />
               
               <QuickStageButton 
                 label="Etapa Amarilla" 
                 icon={<TimerIcon className="w-6 h-6" />}
                 active={dataPoints.some(p => p.type === 'YELLOW')}
                 onClick={() => openMilestoneModal('YELLOW')}
                 color="border-yellow-500/30 text-yellow-500 bg-yellow-500/5"
               />

               <QuickStageButton 
                 label="Etapa Marrón" 
                 icon={<BarChart3 className="w-6 h-6" />}
                 active={dataPoints.some(p => p.type === 'FC_START')}
                 onClick={() => openMilestoneModal('FC_START')}
                 color="border-amber-700/30 text-amber-600 bg-amber-700/5"
               />

               {isRunning && (
                 <button 
                   onClick={handleStop}
                   className="w-full bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white border-2 border-red-600/30 p-6 rounded-2xl font-black uppercase transition-all flex items-center justify-center space-x-3"
                 >
                    <Square className="w-6 h-6 fill-current" />
                    <span>DROP (Descarga)</span>
                 </button>
               )}
            </div>

            {/* Phase Ratio Panel (Improvement B) */}
            <div className="bg-[#14161a] p-6 rounded-[32px] border border-white/5 shadow-xl">
               <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-6">Phase Ratios</h3>
               <div className="space-y-6">
                  <PhaseMetric label="Secado" value={ratios.drying} color="bg-yellow-500" />
                  <PhaseMetric label="Maillard" value={ratios.maillard} color="bg-amber-900" />
                  <PhaseMetric label="Desarrollo" value={ratios.development} color="bg-orange-800" />
               </div>
            </div>

             {/* BBP Stats & Cooldown (Improvement D) */}
            <div className={`p-6 rounded-[32px] border transition-all ${bbpTimeLeft > 0 ? 'bg-blue-600/10 border-blue-500/30' : 'bg-black/40 border-white/5'}`}>
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest mb-4">
                   <span className={bbpTimeLeft > 0 ? 'text-blue-400' : 'text-gray-500'}>Protocolo BBP</span>
                   {bbpTimeLeft > 0 ? <TimerIcon className="w-3 h-3 text-blue-400 animate-spin" /> : <CheckCircle className="w-3 h-3 text-gray-600" />}
                </div>
                {bbpTimeLeft > 0 ? (
                  <div className="space-y-2">
                    <p className="text-3xl font-mono font-black text-white">{formatTimeMinutes(bbpTimeLeft)}</p>
                    <p className="text-[9px] text-blue-400/70 font-bold uppercase">Enfriamiento de Tambor en progreso...</p>
                  </div>
                ) : (
                  <div className="flex justify-between items-end">
                    <p className="text-xs font-bold text-gray-400">Tostadas Lote:</p>
                    <p className="text-lg font-black text-white text-right">{roastCount} / 5 <span className="block text-[8px] text-gray-600 uppercase tracking-tighter">Próximo: Limpieza</span></p>
                  </div>
                )}
            </div>

          </div>

          {/* Center: Main Chrono & Chart */}
          <div className="col-span-12 lg:col-span-9 flex flex-col space-y-6">
            
            {/* Top Bar Info */}
            <div className="grid grid-cols-4 gap-4">
               <div className="col-span-2 bg-[#14161a] p-6 rounded-[32px] border border-white/5 flex items-center justify-center">
                  <span className="text-8xl font-mono font-black text-white tracking-tighter tabular-nums drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                     {formatTimeMinutes(elapsedTime)}
                  </span>
               </div>
               <div className="bg-[#14161a] p-6 rounded-[32px] border border-white/5 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-black text-gray-500 uppercase mb-1">RoR (Ascenso)</p>
                  <p className={`text-4xl font-black ${currentRoR < 3 ? 'text-red-400' : 'text-green-400'}`}>{currentRoR}°</p>
                  <p className="text-[10px] text-gray-600 font-bold">C/min</p>
               </div>
               <div className="bg-coffee-accent/10 p-6 rounded-[32px] border border-coffee-accent/20 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-black text-coffee-accent uppercase mb-1">Temp Actual</p>
                  <p className="text-4xl font-black text-white">
                    {dataPoints.length > 0 ? dataPoints[dataPoints.length-1].temp.toFixed(1) : chargeTempInput}°
                  </p>
               </div>
            </div>

            {/* Dynamic Graph - Increased area and Surgical Precision */}
            <div className="flex-[3] bg-[#14161a] p-8 rounded-[40px] border border-white/5 shadow-2xl relative min-h-[500px]">
                 <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dataPoints} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                       <CartesianGrid strokeDasharray="1 1" stroke="rgba(255,255,255,0.05)" vertical={true} horizontal={true} />
                       <XAxis 
                         dataKey="time" 
                         type="number" 
                         domain={[0, 720]} 
                         ticks={[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390, 420, 450, 480, 510, 540, 570, 600, 630, 660, 690, 720]}
                         tickFormatter={formatTimeMinutes}
                         stroke="rgba(255,255,255,0.3)"
                         tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 'bold' }}
                         axisLine={false}
                         tickLine={false}
                       />
                       <YAxis 
                         orientation="right"
                         domain={[80, 225]} 
                         ticks={[80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200, 205, 210, 215, 220, 225]}
                         stroke="rgba(255,255,255,0.3)"
                         tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace' }}
                         axisLine={false}
                         tickLine={false}
                       />
                       <Tooltip 
                         contentStyle={{ backgroundColor: '#0f1114', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px' }}
                         itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                         labelFormatter={(t) => `Tiempo: ${formatTimeMinutes(Number(t))}`}
                       />

                      {/* Machine Specific Ghost Curve (Improvement B) */}
                      {ghostCurve.length > 0 && (
                        <Line 
                           data={ghostCurve}
                           type="monotone"
                           dataKey="temp"
                           stroke="rgba(255,255,255,0.1)"
                           strokeWidth={4}
                           strokeDasharray="10 10"
                           dot={false}
                           activeDot={false}
                        />
                      )}
                       
                      {/* Artisan 2.0 uses straight connections to emphasize the manual checkpoints */}
                      <Line 
                        type="monotone" 
                        dataKey="temp" 
                        stroke="#d97706" 
                        strokeWidth={6} 
                        dot={{ r: 8, fill: '#d97706', stroke: '#0f1114', strokeWidth: 2 }}
                        activeDot={{ r: 12, strokeWidth: 0 }}
                        animationDuration={500}
                      />
                       
                      {/* Milestone Labels on Graph */}
                      {dataPoints.map((p, i) => p.type && (
                         <ReferenceDot 
                           key={i} 
                           x={p.time} 
                           y={p.temp} 
                           r={14} 
                           fill="#fff" 
                           stroke="#d97706" 
                           strokeWidth={3}
                           label={{ 
                             position: 'top', 
                             value: p.type === 'TP' ? 'Turning P.' : p.type, 
                             fill: '#fff', 
                             fontSize: 10, 
                             fontWeight: 'black',
                             dy: -12,
                             dx: p.time < 60 ? 15 : 0 // Offset TP if too close to axis
                           }}
                         />
                      ))}
                   </LineChart>
                </ResponsiveContainer>
                
                {/* Background Grid Pattern */}
                <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none overflow-hidden rounded-[40px]">
                   <div className="w-full h-full" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
                </div>
            </div>

            {/* Rapid Temp Input (Bottom Bar) */}
            {isRunning && (
              <div className="bg-[#1a1d23] p-4 rounded-3xl border border-white/5 flex items-center space-x-4">
                 <div className="flex-1 bg-black/40 rounded-2xl px-6 py-4 flex items-center justify-between border border-white/5">
                    <span className="text-xs font-black text-gray-500 uppercase">Muestreo Térmico</span>
                    <input 
                      type="number" 
                      value={currentTemp}
                      onChange={(e) => setCurrentTemp(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddTemp()}
                      placeholder="Insertar lectura..."
                      className="bg-transparent text-right text-2xl font-black text-white w-full outline-none"
                    />
                 </div>
                 <button 
                   onClick={() => handleAddTemp()}
                   className="bg-white text-black hover:bg-coffee-light hover:text-white px-10 py-4 rounded-2xl font-black transition-all"
                 >
                    LOG
                 </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* MILESTONE MODAL (Expert Keypad - Improvement A) */}
      {showMilestoneModal && (
        <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
           <div className="bg-[#14161a] border-2 border-white/10 rounded-[48px] p-10 max-w-xl w-full shadow-2xl">
              <div className="text-center mb-8">
                <p className="text-[10px] text-coffee-accent font-black uppercase tracking-[0.3em] mb-4">Capturando Hito Industrial</p>
                <h2 className="text-4xl font-black text-white uppercase mb-2">{pendingMilestone?.type === 'TP' ? 'Turning Point' : pendingMilestone?.type === 'YELLOW' ? 'Etapa Amarilla' : 'Etapa Marrón'}</h2>
                <p className="text-2xl font-mono text-gray-500 font-bold">T+: {formatTimeMinutes(pendingMilestone?.time || 0)}</p>
              </div>
              
              <div className="bg-black/40 rounded-3xl p-6 border border-white/5 mb-8">
                 <div className="text-6xl font-black text-white text-center py-4 tabular-nums">
                    {currentTemp || "000.0"} <span className="text-xl text-gray-600">°C</span>
                 </div>
              </div>

              {/* Industrial Keypad */}
              <div className="grid grid-cols-3 gap-3 mb-8">
                 {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0].map((num) => (
                    <button 
                      key={num}
                      onClick={() => setCurrentTemp(prev => prev + num.toString())}
                      className="h-16 bg-[#1e222b] hover:bg-white/10 rounded-2xl text-2xl font-black text-white transition-all ring-1 ring-white/5"
                    >
                      {num}
                    </button>
                 ))}
                 <button 
                    onClick={() => setCurrentTemp(prev => prev.slice(0, -1))}
                    className="h-16 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl text-xl font-black transition-all ring-1 ring-red-500/20"
                 >
                    DEL
                 </button>
              </div>
              
              <div className="flex space-x-4">
                 <button 
                   onClick={() => { setShowMilestoneModal(false); setCurrentTemp(""); }}
                   className="flex-1 h-14 bg-transparent border border-white/10 rounded-2xl font-black text-gray-500 uppercase tracking-widest hover:text-white"
                 >
                    Cancelar
                 </button>
                 <button 
                   onClick={() => {
                      const t = parseFloat(currentTemp);
                      if (!isNaN(t)) handleConfirmMilestone(t);
                   }}
                   className="flex-[2] h-14 bg-coffee-accent hover:bg-coffee-light rounded-2xl font-black text-white uppercase tracking-widest shadow-lg shadow-coffee-accent/20"
                 >
                    Confirmar Captura
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* FINAL REPORT OVERLAY (Improvement E) */}
      {showFinalReport && (
        <div className="fixed inset-0 z-[120] bg-[#090b0d]/95 backdrop-blur-2xl flex items-center justify-center p-8">
           <div className="bg-[#14161a] border border-white/10 rounded-[60px] p-16 max-w-2xl w-full shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-12 opacity-5 scale-150">
                 <QrCode className="w-64 h-64 text-white" />
              </div>

              <div className="relative z-10 space-y-10">
                 <div className="flex items-center space-x-6">
                    <div className="bg-green-500 p-5 rounded-3xl shadow-lg shadow-green-500/20">
                       <CheckCircle className="w-10 h-10 text-white" />
                    </div>
                    <div>
                       <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Lote Finalizado</h2>
                       <p className="text-sm text-gray-500 font-bold uppercase tracking-widest">Introducción de datos de trazabilidad</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-2">Peso Final (KG)</label>
                       <input 
                         type="number" 
                         value={finalWeight} 
                         onChange={(e) => setFinalWeight(e.target.value)}
                         placeholder="000.0"
                         className={`w-full bg-black/40 border-2 rounded-3xl p-8 text-5xl font-black text-white outline-none ${showShrinkageAlert ? 'border-red-500 animate-pulse' : 'border-white/5 focus:border-coffee-accent'}`}
                       />
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] ml-2">Agtron / Color</label>
                       <input 
                         type="text" 
                         value={agtronColor} 
                         onChange={(e) => setAgtronColor(e.target.value)}
                         placeholder="Ej: 55.4"
                         className="w-full bg-black/40 border-2 border-white/5 rounded-3xl p-8 text-5xl font-black text-coffee-accent focus:border-white outline-none placeholder-coffee-accent/20"
                       />
                    </div>
                 </div>

                  {showShrinkageAlert && (
                     <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-3xl space-y-4 animate-fade-in">
                        <div className="flex items-center space-x-3 text-red-500">
                           <AlertCircle className="w-6 h-6" />
                           <span className="text-sm font-black uppercase tracking-widest">Alerta de Merma Crítica (&gt;15%)</span>
                        </div>
                        <textarea 
                           required
                           value={shrinkageJustification}
                           onChange={(e) => setShrinkageJustification(e.target.value)}
                           placeholder="Justificación técnica obligatoria (Ej: Error de báscula, picos de gas, café excesivamente húmedo...)"
                           className="w-full bg-black/40 border border-red-500/30 rounded-xl p-4 text-white text-sm outline-none focus:border-red-500"
                           rows={3}
                        />
                     </div>
                  )}

                 <div className="bg-black/20 p-6 rounded-3xl border border-white/5 flex items-center justify-between">
                    <div>
                       <p className="text-[10px] text-gray-600 font-black uppercase">Batch Unique ID</p>
                       <p className="text-lg font-mono font-bold text-gray-400">CAN-240KG-{Math.floor(Math.random()*90000)+10000}</p>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] text-gray-600 font-black uppercase">Objetivo Agtron ({currentMachine.id})</p>
                       <p className="text-lg font-black text-coffee-light">{targetAgtron}</p>
                    </div>
                 </div>

                 <button 
                   onClick={handleFinalizeBatch}
                   className="w-full bg-white text-black hover:bg-coffee-accent hover:text-white h-24 rounded-3xl font-black text-2xl uppercase tracking-widest transition-all shadow-2xl active:scale-95"
                 >
                    Cerrar Lote y Generar QR
                 </button>
              </div>
           </div>
        </div>
      )}

       {/* POST-BLEND ASSEMBLY OVERLAY (Phase 6) */}
       {showBlendingOverlay && (
         <div className="fixed inset-0 z-[150] bg-[#090b0d]/98 backdrop-blur-3xl flex items-center justify-center p-8 overflow-y-auto">
            <div className="bg-[#14161a] border-4 border-coffee-accent/30 rounded-[60px] p-16 max-w-4xl w-full shadow-[0_0_100px_rgba(217,119,6,0.2)] relative overflow-hidden my-auto">
               <div className="absolute top-0 right-0 p-12 opacity-5 rotate-12 scale-150">
                  <ArchiveRestore className="w-64 h-64 text-coffee-accent" />
               </div>

               <div className="relative z-10 space-y-8">
                  <div className="flex items-center space-x-6">
                     <div className="bg-coffee-accent p-6 rounded-[32px] shadow-2xl animate-pulse">
                        <CheckCircle className="w-12 h-12 text-white" />
                     </div>
                     <div>
                        <h2 className="text-5xl font-black text-white uppercase tracking-tighter">¡ORDEN DE TUESTE COMPLETADA!</h2>
                        <p className="text-sm text-coffee-light font-bold uppercase tracking-[0.3em]">Proceda al Post-blend • Fase de Ensamblaje</p>
                     </div>
                  </div>

                  <div className="bg-black/40 rounded-[40px] border border-white/5 overflow-hidden">
                     <table className="w-full text-left">
                        <thead className="bg-white/5">
                           <tr className="text-[10px] uppercase font-black text-gray-500 tracking-widest">
                              <th className="px-8 py-5">Componente de Mezcla</th>
                              <th className="px-8 py-5">Silo Destino</th>
                              <th className="px-8 py-5 text-right">Planificado (kg)</th>
                              <th className="px-8 py-5 text-right">Real Obtenido (kg)</th>
                              <th className="px-8 py-5 text-right">Variación</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                           {roastTasks.map((t: any) => {
                              const diffPct = Math.abs((t.actualWeightKg! - t.targetWeightKg) / t.targetWeightKg) * 100;
                              const isAlert = diffPct > 3;
                              return (
                                 <tr key={t.id} className="text-white font-bold">
                                    <td className="px-8 py-6">{t.origins[0]}</td>
                                    <td className="px-8 py-6 text-[10px] font-black text-gray-500">SILO-{t.id.slice(-4)}</td>
                                    <td className="px-8 py-6 text-right font-mono">{t.targetWeightKg.toFixed(1)}</td>
                                    <td className={`px-8 py-6 text-right font-mono ${isAlert ? 'text-red-400' : 'text-coffee-light'}`}>{t.actualWeightKg?.toFixed(1)}</td>
                                    <td className="px-8 py-6 text-right">
                                       {isAlert ? (
                                          <span className="bg-red-500/10 text-red-500 px-2 py-0.5 rounded text-[10px] border border-red-500/30">⚠️ {diffPct.toFixed(1)}%</span>
                                       ) : (
                                          <span className="text-green-500 text-[10px]">OK</span>
                                       )}
                                    </td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>

                  <div className="bg-blue-600/10 border border-blue-500/30 rounded-3xl p-10 flex flex-col space-y-6">
                      <div className="flex items-center space-x-6">
                         <div className={`p-4 rounded-full transition-all ${restingTimeRemaining > 0 ? 'bg-blue-500/20' : 'bg-green-500 shadow-lg shadow-green-500/30'}`}>
                            <TimerIcon className={`w-8 h-8 ${restingTimeRemaining > 0 ? 'text-blue-400 animate-spin' : 'text-white'}`} />
                         </div>
                         <div>
                            <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1">Semáforo de Reposo Digital</p>
                            <p className="text-3xl font-black text-white font-mono uppercase">
                               {restingTimeRemaining > 0 ? formatTimeMinutes(restingTimeRemaining) : "LISTO PARA MEZCLAR"}
                            </p>
                         </div>
                      </div>

                      <div className="bg-black/40 p-8 rounded-[32px] border-2 border-dashed border-blue-500/20">
                         <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-4">Instrucción de Mezcla Industrial</p>
                         <p className="text-2xl font-black text-white leading-tight">
                            "Vierta {roastTasks.map((t: any, i: number) => (
                               <span key={t.id}>
                                  <span className="text-coffee-light">{t.actualWeightKg?.toFixed(1) || t.targetWeightKg.toFixed(1)} kg</span> de {t.origins[0]}
                                  {i < roastTasks.length - 1 ? ' + ' : ''}
                               </span>
                            ))} en el mezclador/silo central."
                         </p>
                         <div className="mt-4 flex items-center text-blue-400 text-[10px] font-bold uppercase tracking-widest">
                            <Info className="w-4 h-4 mr-2" /> Seguir Orden de Carga: Componente A &gt; B &gt; C
                         </div>
                      </div>
                   </div>

                  <div className="flex flex-col space-y-4">
                     <div className="flex flex-col space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4">Peso Total de la Mezcla Final (Báscula de Salida)</label>
                        <input 
                          type="number" 
                          value={finalMixWeight}
                          onChange={(e) => setFinalMixWeight(e.target.value)}
                          placeholder="Introduce peso total..."
                          className="w-full bg-black/40 border-2 border-coffee-accent/50 rounded-3xl p-6 text-3xl font-black text-white outline-none focus:border-coffee-light"
                        />
                     </div>
                     <button 
                       onClick={handleConfirmMix}
                       disabled={restingTimeRemaining > 0}
                       className={`w-full h-24 rounded-3xl font-black text-2xl uppercase tracking-[0.2em] transition-all shadow-2xl flex items-center justify-center
                         ${restingTimeRemaining > 0 ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-coffee-accent hover:bg-coffee-light text-white shadow-[0_0_40px_rgba(217,119,6,0.3)]'}`}
                     >
                        Confirmar Mezcla Realizada
                     </button>
                  </div>
               </div>
            </div>
         </div>
       )}

       {/* SAMPLE PROMPT (Phase 6) */}
       {showSamplePrompt && (
         <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-8 animate-fade-in">
            <div className="bg-[#14161a] border border-blue-500/30 rounded-[48px] p-16 max-w-xl w-full text-center space-y-8 shadow-[0_0_80px_rgba(59,130,246,0.2)]">
               <div className="bg-blue-500/20 p-8 rounded-full w-32 h-32 mx-auto flex items-center justify-center border-2 border-blue-500/30">
                  <TestTube2 className="w-16 h-16 text-blue-400" />
               </div>
               <div>
                  <h2 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">Muestra de Cata</h2>
                  <p className="text-gray-300 font-bold text-xl leading-relaxed">
                     Tome una muestra de <span className="text-blue-400">200g</span> de la mezcla final y llévela al Laboratorio.
                  </p>
               </div>
               <button 
                 onClick={() => {
                   setShowSamplePrompt(false);
                   onBatchComplete(parseFloat(finalMixWeight));
                 }}
                 className="w-full bg-blue-600 hover:bg-blue-500 text-white py-6 rounded-3xl font-black text-xl uppercase tracking-widest transition-all active:scale-95"
               >
                  Entendido, Trazabilidad OK
               </button>
            </div>
         </div>
       )}

       {/* MAINTENANCE OVERLAY */}
      {showMaintenance && (
        <div className="fixed inset-0 z-[130] bg-red-950/90 backdrop-blur-2xl flex items-center justify-center p-8 text-center text-white">
           <div className="max-w-xl space-y-8">
              <Wrench className="w-24 h-24 mx-auto text-red-500 animate-bounce" />
              <h2 className="text-6xl font-black uppercase tracking-tighter">Parada Técnica</h2>
              <p className="text-xl text-red-200 font-bold">5 Ciclos de 240kg completados. Limpia tolva y filtros para continuar enviando lotes a Laboratorio.</p>
              <button 
                onClick={() => { setShowMaintenance(false); setRoastCount(0); }}
                className="bg-white text-red-600 px-16 py-6 rounded-full font-black text-2xl uppercase tracking-tighter shadow-3xl hover:bg-red-600 hover:text-white transition-all"
              >
                 Mantenimiento Realizado
              </button>
           </div>
        </div>
      )}

    </div>
  );
};

/* ARTISAN 2.0 SUB-COMPONENTS */

const QuickStageButton = ({ label, icon, active, onClick, color }: { label: string, icon: React.ReactNode, active: boolean, onClick: () => void, color: string }) => (
  <button 
    onClick={onClick}
    disabled={active}
    className={`w-full p-4 md:p-6 rounded-2xl border-2 flex items-center justify-between transition-all active:scale-95 overflow-hidden ${active ? 'opacity-30 pointer-events-none' : 'hover:scale-102'} ${active ? color : 'bg-[#1e222b] border-white/5 text-gray-400'}`}
  >
     <div className="flex items-center space-x-3 md:space-x-4 flex-1 min-w-0 pr-2">
        <div className={`p-2 md:p-3 rounded-xl flex-shrink-0 ${active ? 'bg-current/10' : 'bg-black/20'}`}>
           {icon}
        </div>
        <span className="font-black uppercase tracking-widest text-[10px] sm:text-xs text-left break-words overflow-hidden w-full leading-tight">{label}</span>
     </div>
     <div className="flex-shrink-0">
       {!active && <CheckCircle className="w-5 h-5 opacity-20" />}
       {active && <CheckCircle className="w-5 h-5" />}
     </div>
  </button>
);

const PhaseMetric = ({ label, value, color }: { label: string, value: string, color: string }) => (
  <div className="space-y-2">
     <div className="flex justify-between items-end">
        <p className="text-[10px] font-black text-gray-500 uppercase overflow-hidden text-ellipsis whitespace-nowrap max-w-[120px]">{label}</p>
        <p className="text-lg font-black text-white">{value}%</p>
     </div>
     <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }}></div>
     </div>
  </div>
);

const CheckItem = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: () => void }) => (
  <button 
    onClick={onChange}
    className={`w-full flex items-center p-5 rounded-2xl border-2 transition-all ${checked ? 'bg-green-500/10 border-green-500/50' : 'bg-[#1e222b] border-white/5 opacity-60 hover:opacity-100'}`}
  >
    <div className={`w-6 h-6 rounded-lg border-2 mr-4 flex items-center justify-center transition-all ${checked ? 'bg-green-500 border-green-500' : 'border-gray-600'}`}>
       {checked && <CheckCircle className="w-4 h-4 text-white" />}
    </div>
    <span className={`text-sm font-bold uppercase tracking-wide ${checked ? 'text-white' : 'text-gray-400'}`}>{label}</span>
  </button>
);

export default ManualRoastControl;
