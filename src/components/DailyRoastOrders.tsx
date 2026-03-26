import React, { useState } from 'react';
import type { MasterProfile, InventoryLot, DailyRoastOrder, RoastTask, OrderCategory } from '../App';
import { Database, Settings, ClipboardList, Cpu, QrCode, Plus, Package, Target, Thermometer, Box, KeyRound, Wrench, CheckCircle, Zap, Scale, Info, AlertTriangle, Lock } from 'lucide-react';
import { ROASTING_MACHINES } from '../App';

interface DailyRoastOrdersProps {
   masterProfiles: MasterProfile[];
   inventoryLots: InventoryLot[];
   setInventoryLots: React.Dispatch<React.SetStateAction<InventoryLot[]>>;
   roastOrders: DailyRoastOrder[];
   setRoastOrders: React.Dispatch<React.SetStateAction<DailyRoastOrder[]>>;
   silos: any[];
   onLaunchManualRoast: (task: RoastTask) => void;
}

const DailyRoastOrders: React.FC<DailyRoastOrdersProps> = ({ masterProfiles, inventoryLots, setInventoryLots, roastOrders, setRoastOrders, silos, onLaunchManualRoast }) => {
   const [viewMode, setViewMode] = useState<'MANAGER' | 'OPERATOR'>('MANAGER');

   // Manager Form State
   const [selectedProfileName, setSelectedProfileName] = useState<string>('');
   const [targetKg, setTargetKg] = useState<number>(120);
   const [priority, setPriority] = useState<'URGENTE' | 'STOCK' | 'MUESTRA'>('STOCK');
   const [orderCategory, setOrderCategory] = useState<OrderCategory>('MARCA_PROPIA'); // Phase 12
   const [selectedMachineId, setSelectedMachineId] = useState<string>('TOST-B');
   const [fragmentationMode, setFragmentationMode] = useState<'BALANCED' | 'MAX_CAPACITY'>('BALANCED');
   // Operator Form State
   const [roastCycles, setRoastCycles] = useState(0);
   const [activeTaskQR, setActiveTaskQR] = useState<string | null>(null);
   const [validatedScales, setValidatedScales] = useState<string[]>([]);

   // Lógica D: Energy Efficiency Thermic Routing (MDD Specialized)
   const [thermalSortEnabled, setThermalSortEnabled] = useState(false);

   const pendingTasks = roastOrders
      .flatMap(o => o.tasks.map(t => ({ ...t, parentOrderPriority: o.priority, parentProfile: o.profileName, parentBusinessUnit: (o.tasks[0]?.masterProfile as any)?.businessUnit })))
      .filter(t => t.status === 'PENDING')
      .sort((a, b) => {
         if (thermalSortEnabled) {
            // Urgent orders still bypass
            if (a.parentOrderPriority === 'URGENTE' && b.parentOrderPriority !== 'URGENTE') return -1;
            if (b.parentOrderPriority === 'URGENTE' && a.parentOrderPriority !== 'URGENTE') return 1;
            // MDD Large batches have priority in efficiency blocks
            if (a.parentBusinessUnit === 'LIDL' && b.parentBusinessUnit !== 'LIDL') return -1;
            if (b.parentBusinessUnit === 'LIDL' && a.parentBusinessUnit !== 'LIDL') return 1;
            // Thermal sorting: Light to Dark
            return b.masterProfile.agtron - a.masterProfile.agtron;
         }
         return 0; // Natural order
      });

   const selectedProfile = masterProfiles.find(p => p.name === selectedProfileName);

   // Shrinkage Estimation (Mock 15% moisture loss)
   const SHRINKAGE_PCT = 0.15;
   const estimatedYield = targetKg * (1 - SHRINKAGE_PCT);

   const handleCreateOrder = (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedProfile) {
         alert("Selecciona un perfil de tueste válido.");
         return;
      }

      const orderId = `ORD-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      let finalTasks: RoastTask[] = [];

      // Auto Silo Assignment Logic (Phase 14)
      const autoSiloAssignments: Record<string, number> = {};

      for (let b of selectedProfile.blend) {
         const reqKg = targetKg * (b.percentage / 100);
         
         const viableSilos = silos.filter(s => s.origin === b.origin && s.currentKg >= reqKg);
         if (viableSilos.length === 0) {
            alert(`ERP Interlock: Stock insuficiente para cumplir con los ${reqKg}kg de ${b.origin} requeridos para esta receta.`);
            return;
         }

         // Desempate: 1. FIFO (Más antiguo), 2. Menos stock (Vaciado eficiente)
         viableSilos.sort((s1, s2) => {
            const time1 = s1.lastFillDate ? new Date(s1.lastFillDate).getTime() : 0;
            const time2 = s2.lastFillDate ? new Date(s2.lastFillDate).getTime() : 0;
            if (time1 !== time2) return time1 - time2;
            return s1.currentKg - s2.currentKg;
         });

         autoSiloAssignments[b.origin] = viableSilos[0].id;
      }

      // PMP calculation logic (Simplified for ER-Silo logic since actual Cost is held at lot level, mock PMP for now)
      const orderPMP = 8.50;

      // ASSET & FRAGMENTATION LOGIC
      const machine = ROASTING_MACHINES.find(m => m.id === selectedMachineId) || ROASTING_MACHINES[1];

      const calculateBatches = (total: number): number[] => {
         if (fragmentationMode === 'BALANCED') {
            const count = Math.ceil(total / machine.maxCapacity);
            const balancedWeight = (total / count) || total;
            return Array.from({ length: count }, () => balancedWeight);
         } else {
            // MAX_CAPACITY Mode: 240, 240, 20...
            const batches: number[] = [];
            let remaining = total;
            while (remaining > 0) {
               const take = Math.min(remaining, machine.maxCapacity);
               batches.push(take);
               remaining -= take;
            }
            return batches;
         }
      };

      if (selectedProfile.roastStrategy === 'PRE_BLEND') {
         const batchWeights = calculateBatches(targetKg);
         finalTasks = batchWeights.map((w, i) => ({
            id: `${orderId}-B${i + 1}`,
            parentOrderId: orderId,
            type: 'ROAST',
            masterProfile: selectedProfile,
            machineId: selectedMachineId,
            origins: selectedProfile.blend.map(b => b.origin),
            assignedSilos: selectedProfile.blend.map(b => autoSiloAssignments[b.origin]),
            targetWeightKg: w,
            status: 'PENDING',
            batchIndex: i + 1,
            totalBatches: batchWeights.length,
            parentOrderTotalKg: targetKg,
            category: orderCategory
         }));
      } else {
         // POST_BLEND: Fragment each origin's roast task independently
         selectedProfile.blend.forEach((b, originIdx) => {
            const originTarget = targetKg * (b.percentage / 100);
            const batchWeights = calculateBatches(originTarget);

            batchWeights.forEach((w, batchIdx) => {
               finalTasks.push({
                  id: `${orderId}-O${originIdx + 1}-B${batchIdx + 1}`,
                  parentOrderId: orderId,
                  type: 'ROAST',
                  masterProfile: selectedProfile,
                  machineId: selectedMachineId,
                  origins: [b.origin],
                  assignedSilos: [autoSiloAssignments[b.origin]],
                  targetWeightKg: w,
                  status: 'PENDING',
                  batchIndex: batchIdx + 1,
                  totalBatches: batchWeights.length,
                  parentOrderTotalKg: originTarget,
                  category: orderCategory
               });
            });
         });

         finalTasks.push({
            id: `${orderId}-ASM`,
            parentOrderId: orderId,
            type: 'BLEND',
            masterProfile: selectedProfile,
            origins: selectedProfile.blend.map(b => b.origin),
            targetWeightKg: estimatedYield,
            status: 'PENDING',
            category: orderCategory
         });
      }

      const newOrder: DailyRoastOrder = {
         id: orderId,
         profileName: selectedProfile.name,
         totalKg: targetKg,
         priority,
         shrinkagePct: SHRINKAGE_PCT,
         tasks: finalTasks,
         status: 'PLANNED',
         estimatedPmpCost: orderPMP,
         category: orderCategory
      };

      // Note: In a real system, we'd tag the order with the machineId here
      // For this prototype, the machine is selected at fragmentation time.

      setRoastOrders([...roastOrders, newOrder]);

      // Toast notification
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-green-500/90 text-white px-6 py-4 rounded-xl font-bold z-50 animate-bounce flex flex-col space-y-1';
      toast.innerHTML = `<span>🚀 Orden ${newOrder.id} Planificada</span>`;
      document.body.appendChild(toast);
      setTimeout(() => document.body.removeChild(toast), 3000);

      // Reset Form
      setSelectedProfileName('');
      setTargetKg(120);
      setPriority('STOCK');
   };

   return (
      <div className="flex flex-col h-full w-full bg-dashboard-bg text-gray-200">

         {/* Top Controller Toggle */}
         <div className="bg-dashboard-panel border-b border-dashboard-border px-6 py-4 flex flex-col md:flex-row items-center justify-between shadow-sm sticky top-0 z-10 w-full">
            <div className="flex items-center space-x-4 mb-4 md:mb-0 w-full md:w-auto">
               <div className="bg-coffee-accent/20 p-2 rounded-lg border border-coffee-accent/30">
                  <ClipboardList className="w-6 h-6 text-coffee-light" />
               </div>
               <div>
                  <h1 className="text-xl font-bold tracking-tight text-white">Agenda de Tueste (Hub)</h1>
                  <p className="text-sm text-gray-400 font-mono tracking-wide">SSOT: Planificación & Ejecución</p>
               </div>
            </div>

            <div className="flex bg-[#14161a] border border-dashboard-border rounded-lg p-1 w-full md:w-auto">
               <button
                  onClick={() => setViewMode('MANAGER')}
                  className={`flex-1 md:flex-none px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all flex items-center justify-center ${viewMode === 'MANAGER' ? 'bg-[#1e222b] text-white shadow ring-1 ring-white/10' : 'text-gray-500 hover:text-gray-300'}`}
               >
                  <Settings className="w-4 h-4 mr-2 text-coffee-light" />
                  Jefe de Producto (MDD/Industrial)
               </button>
               <button
                  onClick={() => setViewMode('OPERATOR')}
                  className={`flex-1 md:flex-none px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all flex items-center justify-center ${viewMode === 'OPERATOR' ? 'bg-[#1e222b] text-blue-400 shadow ring-1 ring-blue-500/50' : 'text-gray-500 hover:text-blue-400/50'}`}
               >
                  <Cpu className="w-4 h-4 mr-2" />
                  Operario de Máquina
               </button>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto p-8 relative">
            {viewMode === 'MANAGER' ? (
               <div className="max-w-7xl mx-auto space-y-10">

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                     {/* Center Col: Order Creator Form */}
                     <div className="lg:col-span-12 xl:col-span-5 bg-dashboard-panel border border-dashboard-border rounded-3xl p-8 shadow-2xl relative overflow-hidden flex flex-col">
                        <h2 className="text-2xl font-black text-white mb-6 uppercase tracking-wider border-b border-dashboard-border pb-4 flex items-center">
                           <Plus className="w-6 h-6 mr-3 text-coffee-light" /> Nueva Orden de Producción
                        </h2>

                        <form onSubmit={handleCreateOrder} className="flex-1 flex flex-col space-y-8">

                           <section className="space-y-6">
                              {/* Order Category Toggle */}
                              <div>
                                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3">1. Rango Estratégico de Producto</label>
                                 <div className="flex bg-[#14161a] p-1.5 rounded-xl justify-between border border-dashboard-border shadow-inner">
                                    <button 
                                       type="button" 
                                       onClick={() => setOrderCategory('MARCA_PROPIA')}
                                       className={`w-1/2 py-3 mr-1 rounded-lg uppercase tracking-widest text-xs font-black transition-all ${orderCategory === 'MARCA_PROPIA' ? 'bg-gradient-to-r from-yellow-600 to-yellow-800 text-white shadow-lg ring-1 ring-yellow-500/50 scale-[1.02]' : 'bg-transparent text-gray-500 hover:text-white hover:bg-white/5'}`}
                                    >
                                       MARCA PROPIA
                                    </button>
                                    <button 
                                       type="button" 
                                       onClick={() => setOrderCategory('MDD')}
                                       className={`w-1/2 py-3 ml-1 rounded-lg uppercase tracking-widest text-xs font-black transition-all ${orderCategory === 'MDD' ? 'bg-gradient-to-r from-blue-700 to-indigo-800 text-white shadow-lg ring-1 ring-blue-500/50 scale-[1.02]' : 'bg-transparent text-gray-500 hover:text-white hover:bg-white/5'}`}
                                    >
                                       MDD (EXTERNO)
                                    </button>
                                 </div>
                                 <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-2">{orderCategory === 'MARCA_PROPIA' ? 'Protocolo: Estricto. Máxima calidad y control de curva.' : 'Protocolo: Estándar Industrial. Foco en volumen y repetibilidad.'}</p>
                              </div>

                              <div>
                                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3">2. Perfil y Volumen</label>
                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <select
                                       required
                                       value={selectedProfileName}
                                       onChange={(e) => setSelectedProfileName(e.target.value)}
                                       className="w-full bg-[#1e222b] border border-dashboard-border rounded-xl p-4 text-white font-bold focus:outline-none focus:border-coffee-light appearance-none"
                                    >
                                       <option value="" disabled>-- Selecciona Gama --</option>
                                       {masterProfiles.map(p => (
                                          <option key={p.name} value={p.name}>{p.name}</option>
                                       ))}
                                    </select>
                                    <div className="flex bg-[#1e222b] border border-dashboard-border rounded-xl items-center px-4 py-3">
                                       <input
                                          type="number" required min="10" step="1"
                                          value={targetKg}
                                          onChange={(e) => setTargetKg(Number(e.target.value))}
                                          className="w-full bg-transparent text-white font-mono text-lg font-black focus:outline-none"
                                       />
                                       <span className="text-gray-500 font-bold ml-2">kg</span>
                                    </div>
                                 </div>
                              </div>

                              {/* Machine Selection (Workstation Selector) */}
                              <div>
                                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3">2. Asignación de Activo (Asset Selection)</label>
                                 <div className="grid grid-cols-2 gap-4">
                                    {ROASTING_MACHINES.map(m => {
                                       const isMDD = selectedProfile?.businessUnit === 'LIDL';
                                       const isLocked = isMDD && targetKg >= 480 && m.id === 'TOST-A';
                                       const isOptimal = (m.id === 'TOST-A' && targetKg <= 140 && !isMDD) || (m.id === 'TOST-B' && (targetKg > 140 || isMDD));
                                       const isWarning = (m.id === 'TOST-B' && targetKg < 80 && !isMDD) || (m.id === 'TOST-A' && targetKg > 130 && !isMDD);
                                       const isActive = selectedMachineId === m.id && !isLocked;

                                       return (
                                          <button
                                             key={m.id}
                                             type="button"
                                             disabled={isLocked}
                                             onClick={() => setSelectedMachineId(m.id)}
                                             className={`relative p-5 rounded-2xl border-2 transition-all flex flex-col text-left group 
                                        ${isLocked ? 'bg-[#0f1114] border-red-900/30 opacity-40 cursor-not-allowed' :
                                                   isActive ? 'bg-coffee-accent/10 border-coffee-accent shadow-lg shadow-coffee-accent/10' : 'bg-[#1e222b] border-dashboard-border hover:border-gray-600'}`}
                                          >
                                             <div className="flex justify-between items-center mb-2">
                                                <span className={`text-sm font-black uppercase ${isLocked ? 'text-red-900' : isActive ? 'text-white' : 'text-gray-400'}`}>
                                                   {m.name} {isLocked && '🔒'}
                                                </span>
                                                {isOptimal && !isLocked && <Zap className="w-4 h-4 text-green-500 fill-current" />}
                                             </div>
                                             <div className="flex items-end justify-between">
                                                <p className="text-2xl font-black text-white">{m.maxCapacity}<span className="text-xs text-gray-500 ml-1">kg</span></p>
                                                {isLocked ? (
                                                   <span className="text-[8px] font-black text-red-500 uppercase border border-red-500/30 px-1.5 rounded">Bloqueo MDD</span>
                                                ) : isOptimal ? (
                                                   <span className="text-[8px] font-black text-green-500 uppercase border border-green-500/30 px-1.5 rounded">Alta Eficiencia</span>
                                                ) : isWarning ? (
                                                   <span className="text-[8px] font-black text-red-500 uppercase border border-red-500/30 px-1.5 rounded">Mala Inercia</span>
                                                ) : null}
                                             </div>

                                             {isActive && !isLocked && <div className="absolute -top-2 -right-2 bg-coffee-accent text-white p-1 rounded-full shadow-lg"><CheckCircle className="w-3 h-3" /></div>}
                                             {isLocked && <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl"><Lock className="w-8 h-8 text-red-500" /></div>}
                                          </button>
                                       );
                                    })}
                                 </div>
                              </div>

                              {/* Fragmentation Mode */}
                              <div>
                                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3">3. Estrategia de Fragmentación</label>
                                 <div className="grid grid-cols-2 gap-2 bg-[#14161a] p-1.5 rounded-xl border border-dashboard-border">
                                    <button
                                       type="button"
                                       onClick={() => setFragmentationMode('BALANCED')}
                                       className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase transition-all ${fragmentationMode === 'BALANCED' ? 'bg-[#1e222b] text-white shadow ring-1 ring-white/10' : 'text-gray-600 hover:text-gray-400'}`}
                                    >
                                       Equilibrado
                                    </button>
                                    <button
                                       type="button"
                                       onClick={() => setFragmentationMode('MAX_CAPACITY')}
                                       className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase transition-all ${fragmentationMode === 'MAX_CAPACITY' ? 'bg-[#1e222b] text-white shadow ring-1 ring-white/10' : 'text-gray-600 hover:text-gray-400'}`}
                                    >
                                       Capacidad Máx
                                    </button>
                                 </div>
                                 <p className="mt-2 text-[10px] text-gray-500 italic flex items-center">
                                    <Info className="w-3 h-3 mr-1" />
                                    {fragmentationMode === 'BALANCED'
                                       ? 'Divide el total en partes iguales (Carga térmica constante).'
                                       : 'Llena la máquina al máximo hasta agotar el lote (Menos tandas).'}
                                 </p>
                              </div>
                           </section>

                           <section className="bg-black/20 p-6 rounded-2xl border border-dashboard-border space-y-4">
                              <div className="flex justify-between items-center text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-dashboard-border pb-2">
                                 <span>Vista Previa del Batching</span>
                                 <Scale className="w-3 h-3" />
                              </div>

                              <div className="flex flex-wrap gap-2">
                                 {(() => {
                                    const m = ROASTING_MACHINES.find(m => m.id === selectedMachineId) || ROASTING_MACHINES[1];
                                    const count = fragmentationMode === 'BALANCED'
                                       ? Math.ceil(targetKg / m.maxCapacity)
                                       : Math.ceil(targetKg / m.maxCapacity);
                                    const balanced = targetKg / count;

                                    return Array.from({ length: count }).map((_, i) => (
                                       <div key={i} className="bg-coffee-accent/5 border border-coffee-accent/20 px-3 py-2 rounded-lg text-center min-w-[60px]">
                                          <p className="text-[8px] text-coffee-light font-black mb-0.5">#{i + 1}</p>
                                          <p className="text-sm font-black text-white">
                                             {fragmentationMode === 'BALANCED'
                                                ? balanced.toFixed(1)
                                                : (i === count - 1 ? (targetKg % m.maxCapacity || m.maxCapacity).toFixed(1) : m.maxCapacity.toFixed(1))}
                                             <span className="text-[8px] ml-0.5">kg</span>
                                          </p>
                                       </div>
                                    ));
                                 })()}
                              </div>
                           </section>

                           {/* Machine Capacity Safety Interlock */}
                           {(() => {
                              const m = ROASTING_MACHINES.find(ma => ma.id === selectedMachineId);
                              if (m && targetKg > m.maxCapacity) {
                                 return (
                                    <div className="bg-orange-500/10 border border-orange-500/50 p-4 rounded-2xl flex items-start space-x-3 mb-4 animate-pulse">
                                       <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                                       <div>
                                          <p className="text-sm font-black text-orange-400 uppercase tracking-widest">Aviso de Capacidad</p>
                                          <p className="text-[11px] text-gray-300 italic">Atención: El lote excede la capacidad nominal de la máquina elegida ({m.maxCapacity} kg). Se requiere fragmentación.</p>
                                       </div>
                                    </div>
                                 );
                              }
                              return null;
                           })()}

                           <div className="pt-2">
                              <button
                                 type="submit"
                                 disabled={!selectedProfileName}
                                 className={`w-full py-6 rounded-2xl text-base font-black uppercase tracking-[0.2em] transition-all shadow-2xl flex items-center justify-center
                              ${selectedProfileName ? 'bg-coffee-accent hover:bg-coffee-light text-white shadow-[0_0_30px_rgba(217,119,6,0.3)] active:scale-95' : 'bg-[#14161a] border border-dashboard-border text-gray-600 cursor-not-allowed'}`}
                              >
                                 <Plus className="w-6 h-6 mr-3" />
                                 PLANIFICAR ORDEN
                              </button>
                           </div>
                        </form>
                     </div>

                     {/* Right Col: Active Queue list */}
                     <div className="lg:col-span-12 xl:col-span-7 flex flex-col space-y-6">
                        <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center border-b border-dashboard-border pb-3">
                           <Target className="w-5 h-5 mr-3 text-gray-500" /> Planificación Activa ({roastOrders.length})
                        </h2>

                        {roastOrders.length === 0 ? (
                           <div className="flex-1 border-2 border-dashed border-dashboard-border rounded-3xl flex flex-col items-center justify-center text-gray-500 p-10 min-h-[300px]">
                              <Package className="w-12 h-12 mb-4 opacity-50" />
                              <p className="font-bold uppercase tracking-widest text-sm text-center">No hay órdenes planificadas.</p>
                              <p className="text-xs mt-2 text-center">Todas las órdenes generadas aparecerán aquí desglosadas por tarea.</p>
                           </div>
                        ) : (
                           <div className="space-y-4">
                              {roastOrders.map((order) => (
                                 <div key={order.id} className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all hover:border-coffee-light/30">
                                    {order.priority === 'URGENTE' && <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-full blur-2xl pointer-events-none"></div>}

                                    <div className="flex justify-between items-start mb-4">
                                       <div className="flex flex-col">
                                          <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1 flex items-center">
                                             Orden {order.id}
                                             {order.category === 'MDD' ? (
                                                <span className="ml-3 bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded text-[9px] font-black tracking-tighter shadow-sm flex items-center">
                                                   <Target className="w-3 h-3 mr-1" /> PROTOCOLO MDD
                                                </span>
                                             ) : (
                                                <span className="ml-3 bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 px-2 py-0.5 rounded text-[9px] font-black tracking-tighter shadow-sm flex items-center">
                                                   <Lock className="w-3 h-3 mr-1" /> MARCA PROPIA
                                                </span>
                                             )}
                                             {order.priority === 'URGENTE' && (
                                                <span className="ml-2 bg-red-500/10 text-red-400 border border-red-500/30 px-2 py-0.5 rounded text-[9px] animate-pulse">URGENTE</span>
                                             )}
                                          </span>
                                          <h3 className="text-lg font-black text-white">{order.profileName} <span className="text-coffee-light ml-2 font-mono">{order.totalKg}kg</span></h3>
                                       </div>
                                       <div className="text-right">
                                          <div className="flex flex-col items-end">
                                             <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border mb-2
                                        ${order.status === 'PLANNED' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
                                                {order.status === 'PLANNED' ? 'PLANNED' :
                                                   order.tasks.find((t: any) => t.type === 'BLEND' && t.status === 'ROASTED') ? 'MEZCLA LISTA ✅' :
                                                      order.tasks.some((t: any) => t.status === 'ROASTED') ? 'EN MEZCLA 🌀' : 'EN PROCESO'}
                                             </span>
                                             {order.status === 'PLANNED' && (
                                                <div className="flex items-center text-[9px] text-gray-500 bg-black/20 px-2 py-1 rounded">
                                                   <Zap className="w-3 h-3 mr-1 text-yellow-500" />
                                                   Sugerencia: Tostar Tras {order.id.slice(-1)} {parseInt(order.id.slice(-1)) % 2 === 0 ? '(Inercia Alta)' : '(Inercia Baja)'}
                                                </div>
                                             )}
                                          </div>
                                       </div>
                                    </div>

                                    {/* Task Breakdown (Lógica B: Blending dinámico) */}
                                    <div className="bg-[#14161a] rounded-xl p-4 border border-dashboard-border">
                                       <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-3 block border-b border-dashboard-border pb-1">Desglose de Tareas (Single Origins)</span>
                                       <div className="space-y-3">
                                          {order.tasks.map((task, idx) => {
                                             const taskOrigin = task.origins[0];
                                             const matchingSilos = silos.filter(s => s.origin === taskOrigin && s.currentKg > 0);
                                             let assignedSilosText = matchingSilos.length > 0
                                                ? matchingSilos.map(s => `Silo ${s.id} (${s.currentKg}kg ext)`).join(', ')
                                                : '⚠️ SIN ASIGNACIÓN DE SILO';

                                             return (
                                                <div key={task.id} className="flex flex-col bg-[#1e222b] px-4 py-2 rounded-lg border border-dashboard-border/50 text-sm overflow-hidden">
                                                   <div className="flex items-center justify-between">
                                                      <div className="flex items-center space-x-3 w-1/2">
                                                         <div className="w-6 h-6 rounded-full bg-dashboard-bg flex items-center justify-center text-[10px] font-black text-gray-500 border border-dashboard-border">
                                                            {idx + 1}
                                                         </div>
                                                         <div className="flex flex-col">
                                                            <span className="font-bold text-gray-300 truncate">
                                                               {task.type === 'ROAST' ? `Tostada ${task.batchIndex} de ${task.totalBatches} para MDD` : task.origins.join(' + ')}
                                                            </span>
                                                            {task.type === 'ROAST' && (
                                                               <span className={`text-[10px] font-bold tracking-widest uppercase mt-0.5 ${matchingSilos.length > 0 ? 'text-blue-400' : 'text-orange-500 animate-pulse'}`}>
                                                                  {matchingSilos.length > 0 ? <Database className="w-3 h-3 inline mr-1" /> : <AlertTriangle className="w-3 h-3 inline mr-1" />}
                                                                  {assignedSilosText}
                                                               </span>
                                                            )}
                                                         </div>
                                                         {task.type === 'BLEND' && <span className="text-[9px] text-coffee-light uppercase tracking-widest">Ensamblaje Final</span>}
                                                         {task.status === 'ROASTED' && <span className="text-[10px] text-green-500 font-black uppercase bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">Terminado</span>}
                                                      </div>
                                                   </div>

                                                   <div className="flex items-center space-x-4">
                                                      <div className="font-mono text-coffee-light font-bold text-right">
                                                         {task.status === 'ROASTED' ? (task.actualWeightKg?.toFixed(1)) : task.targetWeightKg.toFixed(1)} <span className="text-gray-500 text-xs">kg</span>
                                                      </div>
                                                      {task.status === 'ROASTED' && task.type === 'ROAST' && (
                                                         <button
                                                            title="Imprimir Etiqueta de Silo"
                                                            onClick={() => alert(`🖨️ Imprimiendo Etiqueta para SILO-${task.id.slice(-4)}\nComponente: ${task.origins[0]}\nESTADO: ESPERANDO MEZCLA`)}
                                                            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-colors"
                                                         >
                                                            <QrCode className="w-4 h-4" />
                                                         </button>
                                                      )}
                                                   </div>
                                                </div>
                                             );
                                          })}
                                       </div>
                                    </div>
                                    
                                 </div>
                              ))}
                           </div>
                        )}
                     </div>
                  </div>
               </div>
            ) : (
               <div className="max-w-7xl mx-auto space-y-8">
                  <div className="flex justify-between items-center bg-[#14161a] p-6 rounded-2xl border border-dashboard-border shadow-lg">
                     <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter">Panel de Ejecución de Planta</h2>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">Cola de Producción Activa — Sincronización Silos OK</p>
                     </div>
                     <div className="flex items-center space-x-4">
                        <div className="flex flex-col items-end">
                           <span className="text-[10px] font-black text-gray-500 uppercase">Eficiencia Térmica</span>
                           <span className="text-sm font-black text-green-500">OPTIMIZADA</span>
                        </div>
                        <div className="bg-green-500/10 p-3 rounded-xl border border-green-500/30">
                           <Zap className="w-5 h-5 text-green-500 animate-pulse" />
                        </div>
                     </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                     {pendingTasks.map((task, idx) => {
                        const taskOrigin = task.origins[0];
                        const assignedSilo = silos.find(s => s.origin === taskOrigin && s.currentKg > 0);
                        const machine = ROASTING_MACHINES.find(m => m.id === task.machineId);

                        return (
                           <div key={task.id} className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col group hover:border-blue-500/50 transition-all">
                              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                              
                              <div className="flex justify-between items-start mb-6">
                                 <div className="bg-[#14161a] px-3 py-1 rounded-lg border border-dashboard-border">
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">#{idx + 1} Tarea</span>
                                 </div>
                                 <div className={`px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${task.parentOrderPriority === 'URGENTE' ? 'bg-red-500/10 border-red-500/30 text-red-500 animate-pulse' : 'bg-blue-500/10 border-blue-500/30 text-blue-400'}`}>
                                    {task.parentOrderPriority}
                                 </div>
                              </div>

                              <div className="mb-6 flex-1">
                                 <h3 className="text-xl font-black text-white leading-tight mb-2 truncate" title={taskOrigin}>{taskOrigin}</h3>
                                 <div className="flex items-center space-x-2 text-xs text-coffee-light font-bold uppercase tracking-widest">
                                    <Target className="w-4 h-4" />
                                    <span>{task.parentProfile}</span>
                                 </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 mb-8">
                                 <div className="bg-[#14161a] p-3 rounded-xl border border-dashboard-border text-center">
                                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">MÁQUINA</span>
                                    <span className="text-sm font-black text-white">{machine?.name || task.machineId}</span>
                                 </div>
                                 <div className="bg-[#14161a] p-3 rounded-xl border border-dashboard-border text-center">
                                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">CARGA</span>
                                    <span className="text-sm font-black text-coffee-light">{task.targetWeightKg.toFixed(1)}kg</span>
                                 </div>
                              </div>

                              <div className="bg-blue-600/10 border border-blue-500/30 rounded-2xl p-4 mb-6 flex items-center justify-between">
                                 <div className="flex items-center space-x-3">
                                    <div className="bg-blue-600/20 p-2 rounded-lg">
                                       <Database className="w-4 h-4 text-blue-400" />
                                    </div>
                                    <div className="flex flex-col">
                                       <span className="text-[9px] font-black text-gray-500 uppercase tracking-tighter">Silo de Origen</span>
                                       <span className="text-xs font-black text-white">
                                          {assignedSilo ? `Silo ${assignedSilo.id} (${assignedSilo.currentKg}kg)` : 'SIN ASIGNACIÓN'}
                                       </span>
                                    </div>
                                 </div>
                                 {assignedSilo && <CheckCircle className="w-5 h-5 text-green-500" />}
                              </div>

                              <button
                                 onClick={() => onLaunchManualRoast(task)}
                                 disabled={!assignedSilo}
                                 className={`w-full py-4 rounded-xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center space-x-3 
                                    ${assignedSilo ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] active:scale-95' : 'bg-[#14161a] border border-dashboard-border text-gray-600 cursor-not-allowed'}`}
                              >
                                 <Cpu className="w-5 h-5" />
                                 <span>INICIAR TUESTE</span>
                              </button>
                           </div>
                        );
                     })}

                     {pendingTasks.length === 0 && (
                        <div className="col-span-full border-2 border-dashed border-dashboard-border rounded-[48px] p-24 flex flex-col items-center justify-center text-center opacity-40">
                           <ClipboardList className="w-24 h-24 mb-6 text-gray-600" />
                           <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Cola de Tareas Vacía</h2>
                           <p className="text-gray-500 font-bold max-w-sm">No hay tuestes planificados para esta sesión. Consulte con el Jefe de Producto para recibir órdenes de producción.</p>
                        </div>
                     )}
                  </div>
               </div>
            )}
         </div>
      </div>
   );
};

export default DailyRoastOrders;