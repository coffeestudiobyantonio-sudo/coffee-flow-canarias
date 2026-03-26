import React, { useState } from 'react';
import { Search, Download, FileSignature, Droplets, Truck, Flame, Coffee, PackageCheck, AlertTriangle, CheckCircle2, QrCode } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';

import type { ActiveLot } from '../App';

interface TraceabilityProps {
  activeLot: ActiveLot | null;
}

// Mock historical data with an anomaly
const generateMockHistoricalData = () => {
  const data = [];
  for (let i = 0; i < 20; i++) {
    // Inject a spike at minute 12
    const target = 180 + (i * 2.5);
    const actual = i === 12 ? target + 18 : i === 13 ? target + 8 : target + (Math.random() * 2 - 1);
    data.push({
      time: `${String(i).padStart(2, '0')}:00`,
      actualTemp: actual,
      targetTemp: target
    });
  }
  return data;
};

const historicalRoastData = generateMockHistoricalData();

const historicalRadarData = [
  { subject: 'Fragancia', A: 8.5, B: 8.0, fullMark: 10 },
  { subject: 'Aroma', A: 7.8, B: 7.5, fullMark: 10 },
  { subject: 'Sabor', A: 8.6, B: 8.5, fullMark: 10 },
  { subject: 'Cuerpo', A: 8.1, B: 8.0, fullMark: 10 },
];

const TraceabilityDetective: React.FC<TraceabilityProps> = ({ activeLot }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedLot, setSearchedLot] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Determine if we are viewing the live Active Lot or the Historical Anomaly Mock
  const isLiveLot = searchedLot === activeLot?.id;
  const isHistorical = searchedLot !== null && searchedLot !== activeLot?.id;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    setTimeout(() => {
      setSearchedLot(searchQuery.trim());
      setIsSearching(false);
    }, 800);
  };

  const handleGeneratePDF = () => {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 bg-purple-600/90 text-white px-6 py-4 rounded-xl font-bold shadow-[0_0_30px_rgba(147,51,234,0.3)] z-50 animate-bounce flex items-center';
    toast.innerHTML = `<svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Generando Certificado Oficial PDF...`;
    document.body.appendChild(toast);
    setTimeout(() => document.body.removeChild(toast), 3500);
  };

  // Compute display data based on the mode
  const productName = isLiveLot ? activeLot?.profile.name : 'Espresso Barista PRO (Marca Propia)';
  const destination = isLiveLot && activeLot?.profile.name.toLowerCase().includes('lidl') 
    ? 'Plataforma Logística Lidl Canarias' 
    : 'Distribuidora HORECA Arbitrade Canarias';
  
  const blend = isLiveLot ? activeLot?.profile.blend : [
    { origin: 'Brasil Cerrado', percentage: 60, internalLot: 'BR-23-441' },
    { origin: 'Colombia Huila', percentage: 40, internalLot: 'CO-23-899' }
  ];

  const hasAnomaly = isHistorical; // The mock has a temperature spike
  
  return (
    <div className="flex flex-col h-full bg-[#0a0a0b] text-white">
      
      {/* Header & Search Bar */}
      <div className="bg-[#14161a] border-b border-dashboard-border p-6 lg:px-12 flex flex-col md:flex-row items-center justify-between shadow-xl z-20 sticky top-0">
        <div className="flex items-center mb-4 md:mb-0">
          <div className="bg-purple-600/20 p-3 rounded-xl border border-purple-500/30 mr-4">
             <Search className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-widest uppercase">Trazabilidad Forense</h1>
            <p className="text-gray-400 text-sm">Motor de Rastreo Forense Multi-Agente</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="relative w-full md:w-96 group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-500 group-focus-within:text-purple-400 transition-colors" />
          </div>
          <input
            type="text"
            className="block w-full pl-11 pr-4 py-4 bg-[#1e222b] border border-dashboard-border rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all font-mono text-lg shadow-inner"
            placeholder="Introduce ID de Lote..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="submit" className="absolute inset-y-2 right-2 px-4 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-bold uppercase transition-colors shadow-md flex items-center">
             {isSearching ? <span className="animate-pulse">Buscando...</span> : 'Rastrear'}
          </button>
        </form>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 md:p-12 relative">
        
        {!searchedLot ? (
          <div className="h-full flex flex-col items-center justify-center opacity-50">
            <Search className="w-24 h-24 text-gray-600 mb-6" />
            <h2 className="text-2xl font-black text-gray-500 tracking-widest uppercase text-center">Esperando Consulta</h2>
            <p className="text-gray-400 text-center max-w-md mt-2">Introduce un Lote activo (ej. {activeLot?.id || 'LOTE-123'}) o un lote histórico para auditar la cadena de suministro.</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto animate-fade-in-up">
            
            {/* Lote Summary Header */}
            <div className={`bg-dashboard-panel border rounded-2xl p-6 md:p-8 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center shadow-2xl relative overflow-hidden
               ${hasAnomaly ? 'border-red-500/30' : 'border-dashboard-border'}`}>
              
              {hasAnomaly && <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 blur-3xl rounded-full pointer-events-none -mr-10 -mt-10"></div>}
              
              <div className="z-10 w-full mb-6 md:mb-0">
                 <div className="flex items-center space-x-3 mb-2">
                   <div className={`px-3 py-1 text-xs font-black uppercase tracking-widest rounded border 
                     ${hasAnomaly ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>
                     {hasAnomaly ? 'Incidencia Detectada (Tueste)' : 'Lote Validado'}
                   </div>
                   {searchedLot?.includes('MDD') || searchedLot?.toLowerCase().includes('lidl') ? (
                     <span className="px-3 py-1 text-xs font-black uppercase tracking-widest rounded border bg-blue-500/10 text-blue-400 border-blue-500/30">
                       Master Lot MDD (Multi-Batch)
                     </span>
                   ) : isLiveLot && activeLot?.machineId ? (
                     <span className="px-3 py-1 text-xs font-black uppercase tracking-widest rounded border bg-purple-500/10 text-purple-400 border-purple-500/30">
                       Máquina: {activeLot.machineId}
                     </span>
                   ) : null}
                   <span className="text-gray-500 text-sm font-mono">{searchedLot}</span>
                 </div>
                 <h2 className="text-3xl font-black tracking-wide text-white">{productName}</h2>
                 <p className="text-gray-400 mt-1 flex items-center text-sm">
                   <FileSignature className="w-4 h-4 mr-2" /> Responsable de Planta: A. Márquez
                 </p>
              </div>

              <div className="z-10 w-full md:w-auto flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                {(searchedLot?.includes('MDD') || searchedLot?.toLowerCase().includes('lidl')) && (
                   <button onClick={() => alert("Master QR MDD: Lote Agregado de 10 Tostadas (2.400kg Total)")} className="px-6 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 transition-all flex items-center justify-center text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-500/20">
                      <QrCode className="w-5 h-5 mr-3" />
                      Master QR MDD
                   </button>
                )}
                <button onClick={handleGeneratePDF} className="w-full md:w-auto px-6 py-4 rounded-xl bg-[#14161a] border border-dashboard-border hover:border-purple-500 hover:bg-[#1e222b] transition-all flex items-center justify-center text-sm font-black uppercase tracking-widest group">
                  <Download className="w-5 h-5 mr-3 text-purple-400 group-hover:-translate-y-1 transition-transform" />
                  Certificado Calidad (PDF)
                </button>
              </div>
            </div>

            {/* Forensic Timeline */}
            <div className="relative border-l-2 border-dashboard-border ml-6 pl-10 space-y-12 pb-12">
              
              {/* Stepper Logic Connector Lines implicitly handled by border-l */}

              {/* 1. Origen / Inventario */}
              <TimelineCard 
                icon={<Droplets />} 
                title="1. Recepción & Origen (Verde)" 
                status="OK - Humedad 11.2%" 
                statusColor="text-green-400"
                borderColor="border-green-500/30"
                bgColor="bg-green-500/10"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                   <div className="bg-[#14161a] p-4 rounded-xl border border-dashboard-border">
                     <p className="text-xs text-gray-500 uppercase tracking-widest font-black mb-3">Composición del Blend</p>
                     <div className="space-y-2">
                       {blend && blend.map((b: any, idx) => (
                         <div key={idx} className="flex justify-between items-center bg-[#1e222b] px-3 py-2 rounded border border-gray-800">
                           <span className="text-sm font-medium">{b.origin}</span>
                           <div className="flex items-center space-x-2">
                             <span className="text-xs text-gray-500 font-mono">Lot {b.internalLot || `${b.origin.substring(0,3).toUpperCase()}-101`}</span>
                             <span className="text-coffee-light font-bold font-mono">{b.percentage}%</span>
                           </div>
                         </div>
                       ))}
                     </div>
                   </div>
                   <div className="bg-[#14161a] p-4 rounded-xl border border-dashboard-border flex flex-col justify-center">
                     <div className="flex justify-between items-center mb-2">
                       <span className="text-sm text-gray-400">Humedad Inicial</span>
                       <span className="font-mono text-green-400 font-bold">11.2%</span>
                     </div>
                     <div className="flex justify-between items-center mb-2">
                       <span className="text-sm text-gray-400">Densidad</span>
                       <span className="font-mono text-gray-300 font-bold">780 g/L</span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span className="text-sm text-gray-400">Fecha Ingreso</span>
                       <span className="font-mono text-gray-500 font-bold">2026-03-21</span>
                     </div>
                   </div>
                </div>
              </TimelineCard>


              {/* 2. Tueste IoT */}
              <TimelineCard 
                icon={<Flame />} 
                title="2. Roast Master IoT (Curva Térmica)" 
                status={hasAnomaly ? "ANOMALÍA: PICO TÉRMICO" : "Perfil Perfecto"} 
                statusColor={hasAnomaly ? "text-red-400" : "text-green-400"}
                borderColor={hasAnomaly ? "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]" : "border-dashboard-border"}
                bgColor={hasAnomaly ? "bg-red-500/10" : "bg-[#1e222b]"}
              >
                {hasAnomaly && (
                  <div className="mb-4 bg-red-500/20 border border-red-500/30 p-3 rounded-lg flex items-start">
                    <AlertTriangle className="w-5 h-5 text-red-500 mr-3 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-red-400">Alerta del Sistema Data Weaver</p>
                      <p className="text-xs text-red-300/80 mt-1">Se detectó una desviación del RoR de +15°C/min en la fase de desarrollo durante 14 segundos. Causado presumiblemente por una variación en la presión del gas.</p>
                    </div>
                  </div>
                )}
                
                <div className="bg-[#14161a] p-4 rounded-xl border border-dashboard-border h-64 relative">
                  <div className="absolute top-4 right-4 flex items-center space-x-3 text-xs z-10">
                     <span className="flex items-center text-gray-400"><span className="w-3 h-3 rounded-full bg-gray-600 mr-1.5" /> Maestro</span>
                     <span className="flex items-center text-coffee-accent"><span className="w-3 h-3 rounded-full bg-coffee-accent mr-1.5" /> Real</span>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalRoastData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" />
                      <XAxis dataKey="time" stroke="#6b7280" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                      <RechartsTooltip contentStyle={{ backgroundColor: '#1e222b', borderColor: '#2e3340' }} />
                      <Line type="monotone" dataKey="targetTemp" stroke="#4b5563" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                      <Line type="monotone" dataKey="actualTemp" stroke={hasAnomaly ? "#ef4444" : "#d97706"} strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </TimelineCard>


              {/* 3. Laboratorio Calidad */}
              <TimelineCard 
                icon={<Coffee />} 
                title="3. Quality Lab (Sensorial / Colorimetría)" 
                status="Validado Manualmente" 
                statusColor="text-green-400"
                borderColor="border-green-500/30"
                bgColor="bg-green-500/10"
              >
                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                   
                    {/* Radar Chart */}
                    <div className="bg-[#14161a] p-4 rounded-xl border border-dashboard-border flex items-center justify-center min-h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={historicalRadarData}>
                          <PolarGrid stroke="#2e3340" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                          <Radar name="Maestro" dataKey="B" stroke="#9ca3af" strokeWidth={1} strokeDasharray="3 3" fill="#9ca3af" fillOpacity={0.1} />
                          <Radar name="Real" dataKey="A" stroke="#a855f7" strokeWidth={2} fill="#a855f7" fillOpacity={0.4} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Stats */}
                    <div className="bg-[#14161a] p-5 rounded-xl border border-dashboard-border flex flex-col justify-between">
                       
                       <div>
                         <span className="text-xs text-gray-500 font-black uppercase tracking-widest mb-2 block">Colorimetría Oficial</span>
                         <div className="flex items-end space-x-2 border-b border-dashboard-border pb-4">
                           <span className="text-4xl font-mono font-black text-purple-400">44.8</span>
                           <span className="text-sm font-bold text-gray-500 mb-1">Agtron</span>
                           <span className="text-xs text-green-500 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20 mb-1 ml-auto">Dentro Tolerancia</span>
                         </div>
                       </div>

                       <div className="mt-4">
                         <span className="text-xs text-gray-500 font-black uppercase tracking-widest mb-2 block">Cadena de Custodia</span>
                         <div className="flex justify-between items-center bg-[#1e222b] p-3 rounded-lg border border-dashboard-border">
                           <div className="flex items-center text-sm font-medium">
                             <CheckCircle2 className="w-5 h-5 text-green-400 mr-2" />
                             Validado por Calidad
                           </div>
                           <span className="text-xs text-gray-400">2026-03-23 09:44 AM</span>
                         </div>
                       </div>
                    </div>

                 </div>
              </TimelineCard>


              {/* 4. Logística y Destino */}
              <TimelineCard 
                icon={<Truck />} 
                title="4. Destino y Logística" 
                status={destination}
                statusColor="text-blue-400"
                borderColor="border-dashboard-border"
                bgColor="bg-dashboard-panel"
              >
                <div className="bg-[#14161a] p-5 rounded-xl border border-dashboard-border mt-4 flex flex-col sm:flex-row justify-between items-center">
                   <div className="flex items-center text-gray-300 mb-4 sm:mb-0">
                     <PackageCheck className="w-8 h-8 text-blue-500 mr-4" />
                     <div>
                       <p className="text-sm font-bold">Lote Empaquetado y Sellado</p>
                       <p className="text-xs text-gray-500 font-mono mt-1">Línea de Envasado #3 - Turno Mañana</p>
                     </div>
                   </div>
                   
                   <div className="flex items-center space-x-4">
                     <div className="text-right">
                       <p className="text-xs uppercase tracking-widest text-gray-500 font-bold">Llegada Prevista (ETA)</p>
                       <p className="text-lg font-mono font-black text-white mt-1">HOY 18:00H</p>
                     </div>
                   </div>
                </div>
              </TimelineCard>

            </div>
            
            <div className="h-12"></div> {/* Padding */}
          </div>
        )}

      </div>
    </div>
  );
};

// Subcomponent for Timeline block
const TimelineCard = ({ icon, title, status, statusColor, borderColor, bgColor, children }: { icon: React.ReactNode, title: string, status: string, statusColor: string, borderColor: string, bgColor: string, children: React.ReactNode }) => (
  <div className="relative">
    {/* Milestone Icon */}
    <div className={`absolute -left-16 top-0 w-12 h-12 rounded-full border-4 border-[#0a0a0b] flex items-center justify-center shadow-lg block mx-auto z-10 ${bgColor} text-white`}>
      <div className="[&>svg]:w-5 [&>svg]:h-5">
        {icon}
      </div>
    </div>
    
    <div className={`bg-dashboard-panel border ${borderColor} rounded-2xl p-6 transition-all hover:shadow-xl group`}>
      <div className="flex flex-col md:flex-row justify-between md:items-center border-b border-dashboard-border pb-4">
        <h3 className="text-lg font-black tracking-widest uppercase text-white">{title}</h3>
        <span className={`text-sm font-bold mt-2 md:mt-0 px-3 py-1 bg-[#14161a] rounded flex items-center space-x-2 border border-dashboard-border`}>
          <span className={`w-2 h-2 rounded-full bg-current ${statusColor}`}></span>
          <span className={`${statusColor}`}>{status}</span>
        </span>
      </div>
      
      {children}
    </div>
  </div>
);

export default TraceabilityDetective;
