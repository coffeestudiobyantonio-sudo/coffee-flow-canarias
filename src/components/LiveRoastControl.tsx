import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { AlertTriangle, Flame, Activity, Target, Droplets, ArrowDown, CheckCircle2, TestTube2, Wind, Plus, Minus } from 'lucide-react';
import type { ActiveLot } from '../App';

interface RoastData {
  timeStr: string;
  beanTemp: number;
  targetTemp: number;
  ror: number;
}

type MilestoneType = 'Charge' | 'Turning Point' | 'Yellow Phase' | 'Browning' | '1st Crack' | 'Drop';

const MILESTONE_SEQUENCE: MilestoneType[] = ['Charge', 'Turning Point', 'Yellow Phase', 'Browning', '1st Crack', 'Drop'];

interface MilestoneData {
  timeSec: number | '';
  temp: number | '';
}

interface LiveRoastControlProps {
  activeLot: ActiveLot | null;
  onRoastComplete?: (data: any) => void;
}

const LiveRoastControl: React.FC<LiveRoastControlProps> = ({ activeLot, onRoastComplete }) => {
  const activeProfile = activeLot?.profile || null;
  
  const [data, setData] = useState<RoastData[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0); 
  const [isRoasting, setIsRoasting] = useState(false);
  
  const [milestones, setMilestones] = useState<Record<MilestoneType, MilestoneData>>({
    'Charge': { timeSec: '', temp: '' },
    'Turning Point': { timeSec: '', temp: '' },
    'Yellow Phase': { timeSec: '', temp: '' },
    'Browning': { timeSec: '', temp: '' },
    '1st Crack': { timeSec: '', temp: '' },
    'Drop': { timeSec: '', temp: '' },
  });

  const [gasPower, setGasPower] = useState(80);
  const [airflow, setAirflow] = useState(50);
  const [finalWeight, setFinalWeight] = useState<number | ''>('');
  
  const initialWeight = 1000;
  
  const hasDropObj = milestones['Drop'];
  const hasDrop = hasDropObj.timeSec !== '' && hasDropObj.temp !== '';

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // DTR Calculation
  let dtr: number | null = null;
  if (milestones['1st Crack'].timeSec !== '' && milestones['Drop'].timeSec !== '') {
    const fc = Number(milestones['1st Crack'].timeSec);
    const drop = Number(milestones['Drop'].timeSec);
    if (drop > 0) dtr = ((drop - fc) / drop) * 100;
  }

  const currentTempRef = useRef(20);
  const currentRorRef = useRef(0);

  // Autofill milestone via Hotkey or UI
  const handleAutofillMilestone = useCallback((type: MilestoneType) => {
    if (!isRoasting) return;
    setMilestones(prev => ({
      ...prev,
      [type]: {
        timeSec: elapsedTime,
        temp: Number(currentTempRef.current.toFixed(1))
      }
    }));
    if (type === 'Drop') setIsRoasting(false);
  }, [elapsedTime, isRoasting]);

  // Keyboard Shortcuts Binding
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid firing if typing in standard input (number/text), allow if just clicking around
      if (document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).type !== 'range') return;
      if (!isRoasting) return;

      switch (e.key.toLowerCase()) {
        case 'c': handleAutofillMilestone('Charge'); break;
        case 't': handleAutofillMilestone('Turning Point'); break;
        case 'y': handleAutofillMilestone('Yellow Phase'); break;
        case 'b': handleAutofillMilestone('Browning'); break;
        case '1': handleAutofillMilestone('1st Crack'); break;
        case 'd': handleAutofillMilestone('Drop'); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAutofillMilestone, isRoasting]);

  // Physics Engine
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRoasting) {
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 1);

        setData((prevData) => {
          const t = elapsedTime + 1;
          const timeStr = formatTime(t);

          let targetTemperature = 20;
          let generatedTemp = currentTempRef.current;
          let calculatedRor = currentRorRef.current;

          if (t < 60) targetTemperature = 20 + (t * 1.5);
          else if (t < 300) targetTemperature = 110 + ((t - 60) * 0.4);
          else if (t < 600) targetTemperature = 206 + ((t - 300) * 0.1);
          else targetTemperature = 236 + ((t - 600) * 0.05);

          const gasInfluence = (gasPower - 50) * 0.02;
          const noise = (Math.random() * 2 - 1) * 0.5 + gasInfluence;
          
          if (t === 1) generatedTemp = 180;
          else if (t < 60 && milestones['Turning Point'].timeSec === '') generatedTemp = prevData[prevData.length-1].beanTemp - 1.5;
          else generatedTemp = prevData[prevData.length-1].beanTemp + 0.3 + noise;

          if (prevData.length > 5) calculatedRor = (generatedTemp - prevData[prevData.length-5].beanTemp) * (60/5);

          currentTempRef.current = generatedTemp;
          currentRorRef.current = calculatedRor;

          return [...prevData, { timeStr, beanTemp: generatedTemp, targetTemp: targetTemperature, ror: calculatedRor }];
        });
      }, 1000); 
    }
    return () => clearInterval(interval);
  }, [isRoasting, elapsedTime, gasPower, milestones]);

  const startRoast = () => {
    if (!activeProfile) return;
    setData([]);
    setElapsedTime(0);
    setMilestones({
      'Charge': { timeSec: '', temp: '' },
      'Turning Point': { timeSec: '', temp: '' },
      'Yellow Phase': { timeSec: '', temp: '' },
      'Browning': { timeSec: '', temp: '' },
      '1st Crack': { timeSec: '', temp: '' },
      'Drop': { timeSec: '', temp: '' },
    });
    currentTempRef.current = 200;
    setIsRoasting(true);
    setFinalWeight('');
  };

  const getMilestoneColor = (type: MilestoneType) => {
    switch(type) {
      case 'Charge': return '#60a5fa'; 
      case 'Turning Point': return '#c084fc'; 
      case 'Yellow Phase': return '#facc15'; 
      case 'Browning': return '#fb923c'; 
      case '1st Crack': return '#ef4444'; 
      case 'Drop': return '#4ade80'; 
    }
  };

  const getMilestoneIcon = (type: MilestoneType) => {
    switch(type) {
      case 'Charge': return <ArrowDown className="w-5 h-5 text-blue-400" />;
      case 'Turning Point': return <Activity className="w-5 h-5 text-purple-400" />;
      case 'Yellow Phase': return <Target className="w-5 h-5 text-yellow-400" />;
      case 'Browning': return <Droplets className="w-5 h-5 text-orange-400" />;
      case '1st Crack': return <Flame className="w-5 h-5 text-red-500" />;
      case 'Drop': return <CheckCircle2 className="w-5 h-5 text-green-400" />;
    }
  };

  // Build plotted dots array
  const activeDots = MILESTONE_SEQUENCE.filter(k => milestones[k].timeSec !== '' && milestones[k].temp !== '').map(k => ({
    id: k,
    type: k,
    timeSec: Number(milestones[k].timeSec),
    temp: Number(milestones[k].temp)
  }));

  // Coherence validation
  let consistencyError = null;
  const tp = milestones['Turning Point'].temp;
  const y = milestones['Yellow Phase'].temp;
  if (tp !== '' && y !== '' && Number(y) < Number(tp)) {
    consistencyError = "Error: Temp of Yellow Phase cannot be lower than Turning Point.";
  }

  // Update handlers for grid inputs
  const handleGridUpdate = (type: MilestoneType, field: 'timeSec' | 'temp', value: number | '') => {
    setMilestones(prev => ({
      ...prev,
      [type]: { ...prev[type], [field]: value }
    }));
  };

  const handleStepper = (type: MilestoneType, field: 'timeSec' | 'temp', delta: number) => {
    setMilestones(prev => {
      const current = prev[type][field];
      const val = current === '' ? (field === 'timeSec' ? elapsedTime : currentTempRef.current) : Number(current);
      return {
        ...prev,
        [type]: { ...prev[type], [field]: val + delta }
      };
    });
  };

  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-[#0a0a0b] text-white p-6 overflow-x-hidden overflow-y-auto max-w-screen-2xl mx-auto space-y-6 lg:space-y-0 lg:space-x-6">
      
      {/* Left Column: Metrics & Chart */}
      <div className="flex-1 flex flex-col space-y-4">
        
        {/* Top Header Metrics (Same Design) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
          <div className="bg-[#14161a] border border-dashboard-border p-5 rounded-2xl shadow-lg relative overflow-hidden">
            <span className="text-xs font-black tracking-widest uppercase text-gray-500 mb-1 block">Bean Temp</span>
            <span className="text-4xl font-mono text-coffee-light font-bold">
              {currentTempRef.current.toFixed(1)}<span className="text-xl text-gray-400 ml-1">°C</span>
            </span>
          </div>
          <div className="bg-[#14161a] border border-dashboard-border p-5 rounded-2xl shadow-lg relative overflow-hidden">
            <span className="text-xs font-black tracking-widest uppercase text-gray-500 mb-1 block">Rate of Rise</span>
            <span className="text-4xl font-mono text-green-400 font-bold">{currentRorRef.current.toFixed(1)}</span>
          </div>
          <div className="bg-[#14161a] border border-dashboard-border p-5 rounded-2xl shadow-lg relative overflow-hidden">
            <span className="text-xs font-black tracking-widest uppercase text-gray-500 mb-1 block">Elapsed Time</span>
            <span className="text-4xl font-mono text-white font-bold tracking-widest">{formatTime(elapsedTime)}</span>
          </div>
          <div className="bg-[#1e222b] border border-purple-500/30 p-5 rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.1)] flex flex-col justify-center items-center">
            {dtr !== null ? (
               <>
                 <span className="text-xs font-black tracking-widest uppercase text-purple-400 mb-1 block">Dev Time Ratio</span>
                 <span className="text-3xl font-mono text-purple-300 font-bold">{dtr.toFixed(1)}%</span>
               </>
            ) : <span className="text-xs font-bold text-gray-500 uppercase text-center block leading-tight">DTR% Calculado al Drop</span>}
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 min-h-[400px] bg-[#14161a] border border-dashboard-border rounded-2xl p-6 relative">
          <div className="absolute top-6 left-6 z-10"><h2 className="text-lg font-black uppercase tracking-widest text-coffee-accent">Interactive Curve</h2></div>
          <div className="w-full h-full mt-6">
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" vertical={false} />
                <XAxis dataKey="timeStr" stroke="#6b7280" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" stroke="#d97706" domain={[20, 240]} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" stroke="#22c55e" domain={[-15, 30]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1e222b', borderColor: '#2e3340', borderRadius: '8px' }} />
                <Line yAxisId="left" type="monotone" dataKey="targetTemp" stroke="#4b5563" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                <Line yAxisId="left" type="monotone" dataKey="beanTemp" stroke="#d97706" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#d97706' }} />
                <Line yAxisId="right" type="monotone" dataKey="ror" stroke="#22c55e" strokeWidth={2} dot={false} />
                
                {/* Dynamically plot manual grid entries */}
                {activeDots.map((m) => (
                   <ReferenceDot 
                     key={m.id} yAxisId="left" x={formatTime(m.timeSec)} y={m.temp} r={6} 
                     fill={getMilestoneColor(m.type)} stroke="#fff" strokeWidth={2} 
                     label={{ position: 'top', value: m.type, fill: getMilestoneColor(m.type), fontSize: 10, fontWeight: 'bold' }} 
                   />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Right Column: Advanced Manual Input Data Grid */}
      <div className="w-full lg:w-[500px] flex flex-col space-y-4 shrink-0 overflow-y-auto">
        
        <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-5 shadow-lg flex-1">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-black uppercase text-white tracking-widest">Registro Manual de Hitos</h3>
            {!isRoasting && !hasDrop && (
              <button onClick={startRoast} disabled={!activeProfile} className="px-4 py-2 bg-coffee-accent hover:bg-coffee-light rounded text-xs font-bold uppercase transition-all text-white shadow-[0_0_15px_rgba(217,119,6,0.3)]">
                Start Cycle
              </button>
            )}
          </div>

          {consistencyError && (
            <div className="mb-4 bg-red-500/10 border border-red-500/30 p-3 rounded-lg flex items-center shadow-[0_0_10px_rgba(239,68,68,0.2)]">
              <AlertTriangle className="w-5 h-5 text-red-500 mr-2 shrink-0" />
              <p className="text-xs font-bold text-red-400">{consistencyError}</p>
            </div>
          )}

          <div className="space-y-4">
            {MILESTONE_SEQUENCE.map((type, idx) => {
              const current = milestones[type];
              const prev = idx > 0 ? milestones[MILESTONE_SEQUENCE[idx - 1]] : null;
              
              const dt = (prev && current.timeSec !== '' && prev.timeSec !== '') ? Number(current.timeSec) - Number(prev.timeSec) : null;
              const dTemp = (prev && current.temp !== '' && prev.temp !== '') ? Number(current.temp) - Number(prev.temp) : null;

              return (
                <div key={type} className="bg-[#14161a] border border-dashboard-border rounded-xl p-4 transition-all focus-within:border-gray-500">
                  <div className="flex items-center justify-between mb-3">
                    <span className="flex items-center text-sm font-bold uppercase tracking-wide" style={{ color: getMilestoneColor(type) }}>
                      {getMilestoneIcon(type)} <span className="ml-2">{type}</span>
                    </span>
                    <button onClick={() => handleAutofillMilestone(type)} disabled={!isRoasting} className="text-[10px] font-mono bg-[#1e222b] px-2 py-1 rounded text-gray-400 hover:text-white border border-gray-700">
                      AUTOFILL / {type.charAt(0)}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     {/* Time UX */}
                     <div>
                       <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Time (Secs)</label>
                       <div className="flex items-center bg-[#1e222b] rounded-lg border border-gray-700">
                         <button onClick={()=>handleStepper(type, 'timeSec', -1)} className="p-2 hover:bg-gray-700 rounded-l text-gray-400"><Minus className="w-4 h-4"/></button>
                         <input type="number" value={current.timeSec} onChange={e => handleGridUpdate(type, 'timeSec', e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full bg-transparent text-center text-white font-mono font-bold focus:outline-none appearance-none" />
                         <button onClick={()=>handleStepper(type, 'timeSec', 1)} className="p-2 hover:bg-gray-700 rounded-r text-gray-400"><Plus className="w-4 h-4"/></button>
                       </div>
                     </div>
                     
                     {/* Temp UX */}
                     <div>
                       <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Temp (°C)</label>
                       <div className="flex items-center bg-[#1e222b] rounded-lg border border-gray-700">
                         <button onClick={()=>handleStepper(type, 'temp', -0.5)} className="p-2 hover:bg-gray-700 rounded-l text-gray-400"><Minus className="w-4 h-4"/></button>
                         <input type="number" step="0.5" value={current.temp} onChange={e => handleGridUpdate(type, 'temp',  e.target.value === '' ? '' : Number(e.target.value))}
                                className="w-full bg-transparent text-center text-white font-mono font-bold focus:outline-none appearance-none" />
                         <button onClick={()=>handleStepper(type, 'temp', 0.5)} className="p-2 hover:bg-gray-700 rounded-r text-gray-400"><Plus className="w-4 h-4"/></button>
                       </div>
                     </div>
                  </div>

                  {/* Deltas Display */}
                  {dt !== null && dTemp !== null && (
                     <div className="flex items-center mt-3 text-[10px] font-mono text-gray-500 bg-[#0a0a0b] px-2 py-1 flex justify-between rounded border border-gray-800">
                       <span>Δ {formatTime(dt)} min transcurridos</span>
                       <span className={dTemp > 0 ? 'text-green-500/70' : 'text-blue-400/70'}>
                          {dTemp > 0 ? '▲' : '▼'} {Math.abs(dTemp).toFixed(1)}°C {dTemp > 0 ? 'Ganancia' : 'Pérdida'}
                       </span>
                     </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Environmental & Yield Actions block */}
        <div className="grid grid-cols-2 gap-4 shrink-0">
          <div className="bg-[#14161a] border border-dashboard-border rounded-xl p-4">
            <span className="text-[10px] font-bold flex items-center text-coffee-accent uppercase tracking-widest mb-2"><Flame className="w-3 h-3 mr-1"/> Gas Power ({gasPower}%)</span>
            <input type="range" min="0" max="100" value={gasPower} onChange={(e)=>setGasPower(Number(e.target.value))} className="w-full h-1 bg-[#1e222b] cursor-pointer accent-coffee-accent" />
          </div>
          <div className="bg-[#14161a] border border-dashboard-border rounded-xl p-4">
            <span className="text-[10px] font-bold flex items-center text-blue-400 uppercase tracking-widest mb-2"><Wind className="w-3 h-3 mr-1"/> Airflow ({airflow}%)</span>
            <input type="range" min="0" max="100" value={airflow} onChange={(e)=>setAirflow(Number(e.target.value))} className="w-full h-1 bg-[#1e222b] cursor-pointer accent-blue-400" />
          </div>
        </div>

        {hasDrop && (
           <div className="bg-purple-600/10 border border-purple-500/30 rounded-2xl p-5 shadow-[0_0_30px_rgba(147,51,234,0.15)] shrink-0 animate-fade-in-up">
             <div className="mb-4 bg-[#14161a] p-3 rounded-xl border border-dashboard-border flex justify-between items-center">
               <span className="text-xs uppercase tracking-widest text-gray-400 font-bold">Peso Salida kg:</span>
               <div className="flex items-center">
                  <input type="number" placeholder="Ej: 850" value={finalWeight} onChange={(e)=>setFinalWeight(e.target.value === '' ? '' : Number(e.target.value))} className="w-24 bg-[#1e222b] border border-gray-700 rounded-lg p-2 text-white font-mono text-center appearance-none mr-3" />
                  <div className="text-right">
                    <span className="block text-[10px] text-purple-400 font-bold uppercase">Merma</span>
                    <span className="font-mono font-black text-white">{typeof finalWeight === 'number' && finalWeight > 0 ? (((initialWeight - finalWeight) / initialWeight) * 100).toFixed(1) + '%' : '--%'}</span>
                  </div>
               </div>
             </div>
             <button onClick={() => onRoastComplete && onRoastComplete({finalTemp: Number(milestones['Drop'].temp), devTime: Number(milestones['Drop'].timeSec), dtr, merma: typeof finalWeight === 'number' ? ((initialWeight - finalWeight) / initialWeight) * 100 : null})} className="w-full py-4 rounded-xl font-black text-sm tracking-widest uppercase bg-purple-600 hover:bg-purple-500 text-white shadow-lg transition-transform active:scale-95 flex items-center justify-center">
               <TestTube2 className="w-5 h-5 mr-3" /> Enviar Laboratorio de Calidad
             </button>
           </div>
        )}
      </div>
    </div>
  );
};

export default LiveRoastControl;
