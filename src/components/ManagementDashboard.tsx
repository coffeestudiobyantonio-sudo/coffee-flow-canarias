import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, ScatterChart, Scatter, ZAxis, Cell, Legend } from 'recharts';
import { AlertTriangle, Download, FileCheck, Target, Factory, ArrowDownToLine, ArrowUpFromLine, ShieldCheck, TrendingUp, Zap, Server, PiggyBank } from 'lucide-react';

// --- MOCK DATA ---
const homogeneityData = [
  { day: 'Lun', agtronDev: 1.2, sensoryDev: 0.5 },
  { day: 'Mar', agtronDev: -0.8, sensoryDev: 0.2 },
  { day: 'Mié', agtronDev: 2.1, sensoryDev: 1.1 },
  { day: 'Jue', agtronDev: -1.5, sensoryDev: -0.4 },
  { day: 'Vie', agtronDev: 0.3, sensoryDev: 0.1 },
  { day: 'Sáb', agtronDev: 0.0, sensoryDev: 0.0 },
];

const yieldData = [
  { stage: 'Green Intake', kg: 5000, color: '#3b82f6' },
  { stage: 'Roasted Vol', kg: 4250, color: '#a855f7' }, // 15% moisture loss is standard
  { stage: 'Lab Approved', kg: 4100, color: '#10b981' }, // Shrinkage/Reject
  { stage: 'Packaged', kg: 4050, color: '#fbbf24' }
];

const originQualityData = [
  { origin: 1, score: 82.5, name: 'Colombia' },
  { origin: 2, score: 80.0, name: 'Brasil Cerrado' },
  { origin: 3, score: 84.1, name: 'Ethiopia Yirg.' },
  { origin: 4, score: 79.5, name: 'Uganda Robusta' },
  { origin: 5, score: 85.0, name: 'Kenya AA' },
];

const profitabilityData = [
  { unit: 'Externa (MDD)', volumeKg: 24500, marginPct: 18 },
  { unit: 'Marca Propia', volumeKg: 8200, marginPct: 42 }
];

const ManagementDashboard: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    setTimeout(() => {
      window.print(); // Triggers browser print to PDF
      setIsExporting(false);
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full w-full bg-dashboard-bg text-gray-200">
      
      {/* Top Banner */}
      <div className="bg-dashboard-panel border-b border-dashboard-border px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-500/20 p-2 rounded-lg border border-blue-500/30">
            <Factory className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Panel Ejecutivo (Insight Agent)</h1>
            <p className="text-sm text-gray-400">Dashboard Ejecutivo - Trazabilidad y Rendimiento</p>
          </div>
        </div>
        <button 
          onClick={handleExport}
          className="bg-[#1e222b] hover:bg-[#2e3340] border border-dashboard-border text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center h-10"
        >
          {isExporting ? 'Generando PDF...' : <><Download className="w-4 h-4 mr-2" /> Exportar Informe Completo</>}
        </button>
      </div>

      <div className="flex-1 p-6 grid grid-cols-12 gap-6 overflow-y-auto">
        
        {/* Phase 8: Executive KPIs (OEE & ROI) */}
        <div className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-6 mb-2">
           
           {/* OEE TOST-A */}
           <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl transform translate-x-12 -translate-y-12"></div>
              <div className="flex justify-between items-start mb-4 relative z-10">
                 <div>
                   <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">OEE Global • TOST-A (120kg)</p>
                   <h3 className="text-3xl font-black text-white mt-1">74.2%</h3>
                 </div>
                 <div className="bg-[#1e222b] p-3 rounded-xl border border-dashboard-border">
                   <Server className="w-6 h-6 text-blue-400" />
                 </div>
              </div>
              <div className="space-y-2 relative z-10">
                 <div className="flex justify-between text-[10px] font-bold text-gray-400"><span className="uppercase">Disponibilidad</span><span className="text-white">85%</span></div>
                 <div className="flex justify-between text-[10px] font-bold text-gray-400"><span className="uppercase">Rendimiento</span><span className="text-white">91%</span></div>
                 <div className="flex justify-between text-[10px] font-bold text-gray-400"><span className="uppercase">Calidad (SCA)</span><span className="text-white">96%</span></div>
              </div>
           </div>

           {/* OEE TOST-B (Main MDD roaster) */}
           <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl transform translate-x-12 -translate-y-12"></div>
              <div className="flex justify-between items-start mb-4 relative z-10">
                 <div>
                   <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">OEE Global • TOST-B (240kg)</p>
                   <div className="flex items-center mt-1">
                      <h3 className="text-3xl font-black text-white mr-3">89.5%</h3>
                      <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded font-black border border-green-500/30 flex items-center"><TrendingUp className="w-3 h-3 mr-1"/> MDD Loked</span>
                   </div>
                 </div>
                 <div className="bg-[#1e222b] p-3 rounded-xl border border-dashboard-border shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                   <Factory className="w-6 h-6 text-purple-400" />
                 </div>
              </div>
              <div className="space-y-2 relative z-10">
                 <div className="flex justify-between text-[10px] font-bold text-gray-400"><span className="uppercase">Disponibilidad</span><span className="text-white">94%</span></div>
                 <div className="flex justify-between text-[10px] font-bold text-gray-400"><span className="uppercase">Rendimiento</span><span className="text-white">97%</span></div>
                 <div className="flex justify-between text-[10px] font-bold text-gray-400"><span className="uppercase">Calidad (SCA)</span><span className="text-white">98%</span></div>
              </div>
           </div>

           {/* Thermal ROI Target */}
           <div className="bg-gradient-to-br from-[#1e222b] to-[#14161a] border border-green-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl transform translate-x-10 -translate-y-10"></div>
              <div className="flex justify-between items-start mb-2 relative z-10">
                 <div>
                   <p className="text-[10px] text-green-400/80 font-black uppercase tracking-widest flex items-center"><Zap className="w-3 h-3 mr-1" /> Ahorro Térmico (Fase 7)</p>
                   <h3 className="text-3xl font-black text-white mt-1">€1,420<span className="text-sm text-gray-500 ml-1">/mes</span></h3>
                 </div>
                 <div className="bg-green-500/20 p-3 rounded-xl border border-green-500/30">
                   <PiggyBank className="w-6 h-6 text-green-400" />
                 </div>
              </div>
              <p className="text-[10px] text-gray-400 leading-tight block mb-3 relative z-10">Generado por el Motor de Eficiencia Energética (Algoritmo de Inercia Térmica Light-to-Dark).</p>
              <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden relative z-10 border border-white/5">
                 <div className="h-full bg-green-500 w-[78%] rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
              </div>
              <div className="flex justify-between mt-1 text-[9px] font-bold text-gray-500 relative z-10">
                 <span>Meta Mensual: €1.8K</span>
                 <span className="text-green-400">78% alcanzado</span>
              </div>
           </div>
        </div>
        
        {/* Left Column: Alerts & Yield */}
        <div className="col-span-12 lg:col-span-4 flex flex-col space-y-6">
          
          {/* Alerta de Stock Crítico */}
          <div className="bg-red-500/10 border-l-4 border-red-500 rounded-lg p-5 relative overflow-hidden shadow-lg">
            <h3 className="text-red-400 font-bold flex items-center mb-2 text-sm uppercase tracking-wide">
              <AlertTriangle className="w-5 h-5 mr-2" />
              Alerta de Stock Crítico (Compras)
            </h3>
            <p className="text-sm text-gray-300 leading-relaxed font-mono">
              Ritmo de tueste para <span className="text-white font-bold">Lidl Mezcla Directa</span> supera el promedio semanal en un 18%. 
              <br/><br/>
              <strong className="text-red-300">El inventario de Brasil Cerrado (Verde) se agotará en 6.4 días.</strong> 
              <br/><br/>
              Notificación automática enviada al Agente de Compras para aprovisionamiento urgente.
            </p>
          </div>

          {/* Produccion Yield (Embudo) */}
          <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 shadow-xl flex-1 min-h-[300px] flex flex-col">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center mb-4 border-b border-dashboard-border pb-2">
              <ArrowDownToLine className="w-4 h-4 mr-2" />
              Embudo de Producción (Yield Semanal)
            </h2>
            <div className="flex-1 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yieldData} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#2e3340" />
                  <XAxis type="number" stroke="#6b7280" domain={[0, 6000]} />
                  <YAxis dataKey="stage" type="category" stroke="#9ca3af" fontSize={12} width={80} />
                  <RechartsTooltip 
                    cursor={{fill: '#1a1d24'}}
                    contentStyle={{ backgroundColor: '#1a1d24', borderColor: '#2e3340', color: '#fff' }}
                    labelStyle={{ display: 'none' }}
                  />
                  <Bar dataKey="kg" radius={[0, 4, 4, 0]} barSize={32}>
                    {yieldData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Middle/Right Column: Charts & Certificate */}
        <div className="col-span-12 lg:col-span-8 flex flex-col space-y-6">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Índice de Homogeneidad */}
            <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 shadow-xl min-h-[300px] flex flex-col">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center mb-4 border-b border-dashboard-border pb-2">
                <Target className="w-4 h-4 mr-2" />
                Índice de Homogeneidad (Desviación % vs Target)
              </h2>
              <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={homogeneityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" vertical={false} />
                    <XAxis dataKey="day" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" domain={[-5, 5]} fontSize={12} tickFormatter={(val) => `${val}%`} />
                    <RechartsTooltip 
                       contentStyle={{ backgroundColor: '#1a1d24', borderColor: '#2e3340', color: '#fff' }}
                    />
                    <Line type="monotone" name="Desviación Agtron" dataKey="agtronDev" stroke="#a855f7" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{ r: 6 }} />
                    <Line type="monotone" name="Desviación Sensorial" dataKey="sensoryDev" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Mapa de Calor / Scatter */}
            <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 shadow-xl min-h-[300px] flex flex-col">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center mb-4 border-b border-dashboard-border pb-2">
                <ArrowUpFromLine className="w-4 h-4 mr-2" />
                Mapa de Calidad: Origen vs Puntaje
              </h2>
              <div className="flex-1 w-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" />
                    <XAxis type="number" dataKey="origin" name="ID Origen" stroke="#6b7280" tick={false} axisLine={false} />
                    <YAxis type="number" dataKey="score" name="SCA Score" domain={[75, 90]} stroke="#6b7280" fontSize={12} />
                    <ZAxis type="number" range={[100, 300]} />
                    <RechartsTooltip 
                      cursor={{strokeDasharray: '3 3'}}
                      contentStyle={{ backgroundColor: '#1a1d24', borderColor: '#2e3340', color: '#fff' }}
                      formatter={(val, name, props) => {
                         if (name === "SCA Score") return [val, props.payload.name];
                         return null;
                      }}
                    />
                    <Scatter name="Quality Mapping" data={originQualityData} fill="#fbbf24">
                      {originQualityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.score >= 82 ? '#10b981' : entry.score >= 80 ? '#fbbf24' : '#ef4444'} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* Comparativa Rendimiento BU */}
          <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 shadow-xl w-full">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center mb-4 border-b border-dashboard-border pb-2">
              <TrendingUp className="w-4 h-4 mr-2" />
              Comparativa de Negocio: Volumen vs Rentabilidad Mensual
            </h2>
            <div className="h-[250px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={profitabilityData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2e3340" />
                   <XAxis dataKey="unit" stroke="#6b7280" fontWeight="bold" fontSize={12} />
                   <YAxis yAxisId="left" orientation="left" stroke="#10b981" tickFormatter={val => `${(val/1000).toFixed(0)}T`} fontSize={10} />
                   <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" tickFormatter={val => `${val}%`} fontSize={10} />
                   <RechartsTooltip contentStyle={{ backgroundColor: '#1a1d24', borderColor: '#2e3340', color: '#fff', borderRadius: '8px' }} cursor={{fill: '#1e222b'}} />
                   <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: 'bold' }} />
                   <Bar yAxisId="left" dataKey="volumeKg" name="Volumen Operativo (kg)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={50} />
                   <Bar yAxisId="right" dataKey="marginPct" name="Margen de Beneficio (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={50} />
                 </BarChart>
               </ResponsiveContainer>
            </div>
            <div className="bg-black/20 p-3 rounded-lg border border-dashboard-border mt-6">
              <p className="text-[10px] text-gray-400 italic font-medium leading-relaxed">
                <strong className="text-white mr-1">Conclusión Ejecutiva:</strong> 
                El modelo MDD (Lidl) prioriza una alta eficiencia volumétrica para sostener el OEE de TOST-B. Las Marcas Propias absorben menor carga operativa en planta, aportando un margen neto un 130% superior. La sincronización de ambos mundos en la Fase 7 permite escalar la producción garantizando la máxima rentabilidad.
              </p>
            </div>
          </div>

          {/* Certificado Digital */}
          <div className="bg-gradient-to-r from-[#16271c] to-[#121418] border border-green-500/30 rounded-2xl p-8 shadow-2xl relative overflow-hidden flex flex-col lg:flex-row items-center justify-between">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 rounded-full blur-3xl transform translate-x-10 -translate-y-10"></div>
            
            <div className="flex items-center space-x-6 z-10 w-full lg:w-auto mb-6 lg:mb-0">
               <div className="bg-green-500/10 p-4 rounded-2xl border border-green-500/20">
                 <ShieldCheck className="w-12 h-12 text-green-400" />
               </div>
               <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-wider mb-1">Certificado de Firma de Calidad</h2>
                  <p className="text-sm text-green-400 font-mono tracking-wide">ID: AUTH-LIDL-CAN-2026-X89</p>
                  <p className="text-sm text-gray-400 mt-2 max-w-sm">
                    "Este lote cumple con los estrictos estándares de homogeneidad validados por el protocolo de la industria de Antonio Márquez."
                  </p>
               </div>
            </div>

            <div className="z-10 bg-dashboard-bg/50 border border-dashboard-border p-4 rounded-xl flex items-center shrink-0 w-full lg:w-auto justify-center">
               <FileCheck className="w-6 h-6 text-gray-400 mr-3" />
               <div className="flex flex-col">
                 <span className="text-xs text-gray-500 uppercase font-bold">Estado del Lote #CAN-LIDL-003</span>
                 <span className="text-sm text-white font-mono">Homogeneidad Verificada</span>
               </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ManagementDashboard;
