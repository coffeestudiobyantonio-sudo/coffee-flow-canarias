import React, { useState } from 'react';
import type { MasterProfile, DailyRoastOrder, RoastTask, OrderCategory } from '../App';
import { Database, Settings, ClipboardList, Cpu, QrCode, Plus, Package, Target, CheckCircle, Zap, AlertTriangle, Lock, Trash2, Flame } from 'lucide-react';
import { ROASTING_MACHINES } from '../App';
import { createDailyOrder, deleteDailyOrder, purgeAllProductionData } from '../lib/api';

interface DailyRoastOrdersProps {
   masterProfiles: MasterProfile[];
   roastOrders: DailyRoastOrder[];
   setRoastOrders: React.Dispatch<React.SetStateAction<DailyRoastOrder[]>>;
   silos: any[];
   onLaunchManualRoast: (task: RoastTask) => void;
}

interface DelegationDemand {
   id: string;
   delegation: string;
   profileName: string;
   format: '250g' | '450g' | '500g' | '1000g' | '2KG' | 'GRANEL';
   kgRequested: number;
   totalPackages?: number;
}

interface DailyPlan {
   dayIndex: number;
   targetSilos: number[]; // e.g [1,2,3,4] or [5,6,7,8]
   siloAssignments: { siloId: number, origin: string, batches: { profileName: string, format: string }[] }[];
   totalKg: number;
   blocks: { profileName: string, format: string, targetKg: number }[];
   scheduledDate?: string;
}

const DailyRoastOrders: React.FC<DailyRoastOrdersProps> = ({ masterProfiles, roastOrders, setRoastOrders, silos, onLaunchManualRoast }) => {
   const [viewMode, setViewMode] = useState<'PLAN_MENSUAL' | 'MANAGER' | 'OPERATOR'>('PLAN_MENSUAL');

   // Planificador Mensual State
   const [demands, setDemands] = useState<DelegationDemand[]>([]);
   const [plannedDays, setPlannedDays] = useState<DailyPlan[]>([]);
   const [newDemand, setNewDemand] = useState<Partial<DelegationDemand>>({
      delegation: 'Canarias',
      format: '1000g',
      kgRequested: 1890,
      totalPackages: 1890
   });

   // Utility for format weight mapping
   const getFormatWeight = (format: string): number => {
      switch (format) {
         case '250g': return 0.25;
         case '450g': return 0.45;
         case '500g': return 0.5;
         case '1000g': return 1;
         case '2KG': return 2;
         default: return 1;
      }
   };

   // Sync logic
   const syncKgAndPackages = (type: 'KG' | 'PKG', value: number, currentFormat: string) => {
      const weight = getFormatWeight(currentFormat);
      if (type === 'KG') {
         setNewDemand(prev => ({ 
            ...prev, 
            kgRequested: value, 
            totalPackages: Math.round(value / weight) 
         }));
      } else {
         setNewDemand(prev => ({ 
            ...prev, 
            totalPackages: value, 
            kgRequested: Number((value * weight).toFixed(2)) 
         }));
      }
   };


   // Manager Form State
   const [selectedProfileName, setSelectedProfileName] = useState<string>('');
   const [targetKg, setTargetKg] = useState<number>(120);
   const [priority, setPriority] = useState<'URGENTE' | 'STOCK' | 'MUESTRA'>('STOCK');
   const [orderCategory, setOrderCategory] = useState<OrderCategory>('MARCA_PROPIA'); // Phase 12
   // Operator Form State
   
   // Lógica D: Energy Efficiency Thermic Routing (MDD Specialized)
   const thermalSortEnabled = false;

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

   const SHRINKAGE_PCT = selectedProfile ? ((selectedProfile.expectedShrinkage || 16.0) / 100) : 0.16;

   
   // Base theoretical minimum
   const baseRequiredGreenKg = targetKg / (1 - SHRINKAGE_PCT);
   
   // True green sum enforcing exactly 2 Sacks per batch per origin
   let actualTotalGreenRoasting = 0;
   if (selectedProfile) {
      selectedProfile.blend.forEach(b => {
         const originReqGreen = baseRequiredGreenKg * (b.percentage / 100);
         const originBatchSize = (b.sackWeight || 60) * 2;
         const batchesNeeded = Math.ceil(originReqGreen / originBatchSize);
         actualTotalGreenRoasting += batchesNeeded * originBatchSize;
      });
   }

   const trueEstimatedRoasted = actualTotalGreenRoasting * (1 - SHRINKAGE_PCT);
   const excessRoasted = trueEstimatedRoasted - targetKg;

   const handleCreateOrder = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedProfile) {
         alert("Selecciona un perfil de tueste válido.");
         return;
      }

      if (!confirm(`Para fabricar ${targetKg}kg de ${selectedProfile.name} (Merma del ${(SHRINKAGE_PCT * 100).toFixed(1)}%):\nLa agenda forzará tandas cerradas de 2 SACOS según el origen (ej. 120kg o 138kg).\n\nTotal Café Verde que procesarás: ${actualTotalGreenRoasting}kg.\nEl rendimiento final que obtendrás será aprox de ${trueEstimatedRoasted.toFixed(1)}kg tostados.\n\nSobrarán: ${excessRoasted > 0 ? excessRoasted.toFixed(1) : 0}kg tostados que irán al silo de reserva.\n\n¿Proceder con la generación de tareas?`)) {
         return;
      }

      const orderId = `ORD-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
      let finalTasks: RoastTask[] = [];

      // PMP calculation logic (Simplified for ER-Silo logic since actual Cost is held at lot level, mock PMP for now)
      const orderPMP = 8.50;

      // ASSET & FRAGMENTATION LOGIC

      // POST_BLEND implicitly: Fragment each origin's roast task independently enforcing 2 sacks per batch
      selectedProfile.blend.forEach((b, originIdx) => {
         const originReqGreen = baseRequiredGreenKg * (b.percentage / 100);
         const originBatchSize = (b.sackWeight || 60) * 2;
         const batchesNeeded = Math.ceil(originReqGreen / originBatchSize);

         // We no longer calculate irregular batchWeights. Everyone is 2 sacks.
         for (let batchIdx = 0; batchIdx < batchesNeeded; batchIdx++) {
            finalTasks.push({
               id: `${orderId}-O${originIdx + 1}-B${batchIdx + 1}`,
               parentOrderId: orderId,
               type: 'ROAST',
               masterProfile: selectedProfile,
               machineId: 'TOST-A',
               origins: [b.origin],
               targetWeightKg: originBatchSize,
               status: 'PENDING',
               batchIndex: batchIdx + 1,
               totalBatches: batchesNeeded,
               parentOrderTotalKg: batchesNeeded * originBatchSize,
               category: orderCategory
            });
         }
      });

      finalTasks.push({
         id: `${orderId}-ASM`,
         parentOrderId: orderId,
         type: 'BLEND',
         masterProfile: selectedProfile,
         origins: selectedProfile.blend.map(b => b.origin),
         targetWeightKg: trueEstimatedRoasted,
         status: 'PENDING',
         category: orderCategory
      });

      const newOrder: DailyRoastOrder = {
         id: orderId,
         profileName: selectedProfile.name,
         totalKg: actualTotalGreenRoasting, // We store the GREEN weight as total request for legacy tracking if needed
         priority,
         shrinkagePct: SHRINKAGE_PCT,
         tasks: finalTasks,
         status: 'PLANNED',
         estimatedPmpCost: orderPMP,
         category: orderCategory
      };

      // Phase 18: Push to Supabase
      const isSuccess = await createDailyOrder(newOrder);
      if (!isSuccess) {
         alert("Error de sincronización con Supabase al intentar crear la Orden de Tueste.");
         return;
      }

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
   const handleDeleteOrder = async (orderId: string) => {
      const confirmDelete = window.confirm("¿Estás seguro de que deseas eliminar esta orden de producción?");
      if (!confirmDelete) return;

      const isSuccess = await deleteDailyOrder(orderId);
      if (!isSuccess) {
         alert("Error base de datos: Supabase falló la eliminación.");
         return;
      }

      setRoastOrders(roastOrders.filter(o => o.id !== orderId));
   };

   const handlePurgeAll = async () => {
      const confirmPurge = window.confirm("⚠️ ADVERTENCIA CRÍTICA: Vas a borrar TODA la producción planificada y en curso. ¿Estás absolutamente seguro?");
      if (!confirmPurge) return;
      const confirmTwice = window.confirm("Por favor, confirma de nuevo. Esta acción no se puede deshacer.");
      if (!confirmTwice) return;

      const isSuccess = await purgeAllProductionData();
      if (!isSuccess) {
         alert("Error al purgar los datos.");
         return;
      }
      setRoastOrders([]);
      setDemands([]);
      setPlannedDays([]);
      
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-red-500/90 text-white px-6 py-4 rounded-xl font-bold z-50 animate-bounce flex flex-col space-y-1';
      toast.innerHTML = `<span>🚨 Agenda Borrada Exitosamente</span>`;
      document.body.appendChild(toast);
      setTimeout(() => document.body.removeChild(toast), 3000);
   };

   // ============================================
   // MONTHLY PLANNER LOGIC
   // ============================================
   const handleAddDemand = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newDemand.delegation || !newDemand.profileName || !newDemand.kgRequested) return;

      const demand: DelegationDemand = {
         id: `DMD-${Date.now()}`,
         delegation: newDemand.delegation as string,
         profileName: newDemand.profileName as string,
         format: newDemand.format as any,
         kgRequested: newDemand.kgRequested as number,
         totalPackages: newDemand.totalPackages
      };

      setDemands([...demands, demand]);
      
      // Reset input maintaining format and sync
      const defaultKg = 1890;
      setNewDemand(prev => ({ 
         ...prev, 
         kgRequested: defaultKg, 
         totalPackages: Math.round(defaultKg / getFormatWeight(prev.format || '1000g')),
         delegation: prev.delegation 
      }));
   };

   const handleRemoveDemand = (id: string) => {
      setDemands(demands.filter(d => d.id !== id));
   };

   const generateMonthlyPlan = () => {
      if (demands.length === 0) {
         alert("La tabla de demanda está vacía. Añade previsiones primero.");
         return;
      }

      // 1. Group demands by Profile + Format (Independent Lines)
      let queue: { profileName: string, format: string, totalKg: number }[] = [];
      demands.forEach(d => {
         const existing = queue.find(g => g.profileName === d.profileName && g.format === d.format);
         if (existing) {
            existing.totalKg += d.kgRequested;
         } else {
            queue.push({ profileName: d.profileName, format: d.format, totalKg: d.kgRequested });
         }
      });

      // 2. Sort by Format Affinity (The Greedy Algorithm)
      // Pick highest volume -> then all same format -> then next highest...
      const sortedQueue: { profileName: string, format: string, totalKg: number }[] = [];
      let currentFormat: string | null = null;

      while (queue.length > 0) {
         let nextIndex = -1;
         
         if (currentFormat) {
            // Try to find the highest volume item with the same format
            let maxKg = -1;
            queue.forEach((item, idx) => {
               if (item.format === currentFormat && item.totalKg > maxKg) {
                  maxKg = item.totalKg;
                  nextIndex = idx;
               }
            });
         }

         if (nextIndex === -1) {
            // Fallback: Pick highest volume regardless of format
            let maxKg = -1;
            queue.forEach((item, idx) => {
               if (item.totalKg > maxKg) {
                  maxKg = item.totalKg;
                  nextIndex = idx;
               }
            });
         }

         const selected = queue.splice(nextIndex, 1)[0];
         sortedQueue.push(selected);
         currentFormat = selected.format;
      }

      // 3. Process the sorted queue into days/silos
      const computedDays: DailyPlan[] = [];
      let dayIdx = 1;
      
      // Distributor State
      let currentDaySiloAssignments: { siloId: number, origin: string, batches: { profileName: string, format: string }[] }[] = [];
      let currentDayBlocks: { profileName: string, format: string, targetKg: number }[] = [];

      const flushDay = () => {
         if (currentDaySiloAssignments.length > 0) {
            const siloSet = dayIdx % 2 === 1 ? [1, 2, 3, 4] : [5, 6, 7, 8];
            const finalSiloAssignments = currentDaySiloAssignments.map((s, idx) => ({
               ...s,
               siloId: siloSet[idx]
            }));

            let dayTotalKg = 0;
            currentDayBlocks.forEach(b => dayTotalKg += b.targetKg);

            computedDays.push({
               dayIndex: dayIdx,
               targetSilos: siloSet,
               siloAssignments: finalSiloAssignments,
               totalKg: Number(dayTotalKg.toFixed(1)),
               blocks: currentDayBlocks.map(b => ({ ...b, targetKg: Number(b.targetKg.toFixed(1)) }))
            });
            dayIdx++;
            currentDaySiloAssignments = [];
            currentDayBlocks = [];
         }
      };

      sortedQueue.forEach(item => {
         const profile = masterProfiles.find(p => p.name === item.profileName);
         if (!profile) return;

         const shrinkage = (profile.expectedShrinkage || 16) / 100;

         // For each origin in the profile blend
         profile.blend.forEach(component => {
            const targetRoastedForThisOrigin = item.totalKg * (component.percentage / 100);
            const sackWeight = component.sackWeight || 60; // FIX: Correcto peso de origen por defecto (sacos de 60kg).
            const batchSizeGreen = sackWeight * 2;
            const batchSizeRoasted = batchSizeGreen * (1 - shrinkage);
            
            const batchesNeeded = Math.ceil(targetRoastedForThisOrigin / batchSizeRoasted);
            let remainingBatches = batchesNeeded;

            while (remainingBatches > 0) {
               // Find existing silo for this origin on current day
               let silo = currentDaySiloAssignments.find(s => s.origin === component.origin && s.batches.length < 4);
               
               if (!silo) {
                  if (currentDaySiloAssignments.length >= 4) flushDay();
                  silo = { siloId: 0, origin: component.origin, batches: [] };
                  currentDaySiloAssignments.push(silo);
               }

               const spaceInSilo = 4 - silo.batches.length;
               const take = Math.min(remainingBatches, spaceInSilo);

               for (let i = 0; i < take; i++) {
                  silo.batches.push({ profileName: item.profileName, format: item.format });
                  
                  // Track this block's actual roasted weight
                  const roastedWeight = batchSizeRoasted;
                  const existingBlock = currentDayBlocks.find(b => b.profileName === item.profileName && b.format === item.format);
                  if (existingBlock) {
                     existingBlock.targetKg += roastedWeight;
                  } else {
                     currentDayBlocks.push({ profileName: item.profileName, format: item.format, targetKg: roastedWeight });
                  }
               }
               remainingBatches -= take;
            }
         });
      });

      flushDay();
      setPlannedDays(computedDays);
   };

   const handleLaunchDay = async (day: DailyPlan) => {
      const parentOrderId = `PLAN-${day.scheduledDate || 'D' + day.dayIndex}-${Date.now().toString().slice(-4)}`;
      const newTasks: RoastTask[] = [];

      // Sort siloAssignments by origin to ensure correlative roasting
      const sortedAssignments = [...day.siloAssignments].sort((a, b) => a.origin.localeCompare(b.origin));

      // 1. Generate ROAST tasks from Sorted Silo Assignments
      sortedAssignments.forEach((silo) => {
         silo.batches.forEach((batchInfo, bIdx) => {
            const profile = masterProfiles.find(p => p.name === batchInfo.profileName);
            if (!profile) return;
            const sackWeight = profile.blend.find(b => b.origin === silo.origin)?.sackWeight || 60; // FIX: Corregido a 60.
            const batchSizeGreen = sackWeight * 2;

            newTasks.push({
               id: `${parentOrderId}-S${silo.siloId}-B${bIdx + 1}`,
               parentOrderId,
               type: 'ROAST',
               masterProfile: profile,
               origins: [silo.origin],
               targetWeightKg: batchSizeGreen,
               status: 'PENDING',
               category: 'MARCA_PROPIA',
               batchIndex: bIdx + 1,
               totalBatches: silo.batches.length,
               parentOrderTotalKg: day.totalKg,
               assignedSilos: [silo.siloId]
            });
         });
      });

      // 2. Generate BLEND tasks for each profile block in the day
      day.blocks.forEach((block, blIdx) => {
         const profile = masterProfiles.find(p => p.name === block.profileName);
         if (!profile) return;

         newTasks.push({
            id: `${parentOrderId}-BLEND-${blIdx + 1}`,
            parentOrderId,
            type: 'BLEND',
            masterProfile: profile,
            origins: profile.blend.map(b => b.origin),
            targetWeightKg: block.targetKg,
            status: 'PENDING',
            category: 'MARCA_PROPIA',
            assignedSilos: day.targetSilos 
         });
      });

      if (newTasks.length === 0) return;

      const newOrder: DailyRoastOrder = {
         id: parentOrderId,
         profileName: day.blocks[0]?.profileName || 'MAURICE ALICANTO 250 G.',
         totalKg: day.totalKg,
         priority: 'STOCK',
         shrinkagePct: 0.16,
         tasks: newTasks,
         status: 'PLANNED',
         estimatedPmpCost: 8.50,
         category: 'MARCA_PROPIA'
      };

      const isSuccess = await createDailyOrder(newOrder);
      if (!isSuccess) {
         alert("Error insertando el Plan en la Base de Datos. Revisa la consola o los permisos.");
         return;
      }

      setRoastOrders([...roastOrders, newOrder]);
      setPlannedDays(plannedDays.filter(d => d.dayIndex !== day.dayIndex));
      
      // Toast notification
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-4 right-4 bg-green-500/90 text-white px-6 py-4 rounded-xl font-bold z-50 animate-bounce flex flex-col space-y-1';
      toast.innerHTML = `<span>🚀 Plan ${day.scheduledDate || day.dayIndex} inyectado (Silos ${day.targetSilos.join(', ')})</span>`;
      document.body.appendChild(toast);
      setTimeout(() => document.body.removeChild(toast), 3000);
   };

   return (
      <div className="flex flex-col h-full w-full bg-dashboard-bg text-gray-200">

         {/* Top Controller Toggle */}
         <div className="bg-dashboard-panel border-b border-dashboard-border px-6 py-4 flex flex-col items-center md:flex-row justify-between shadow-sm sticky top-0 z-10 w-full relative">
            <div className="flex items-center space-x-4 mb-4 md:mb-0 w-full md:w-auto">
               <div className="bg-coffee-accent/20 p-2 rounded-lg border border-coffee-accent/30">
                  <ClipboardList className="w-6 h-6 text-coffee-light" />
               </div>
               <div>
                  <h1 className="text-xl font-bold tracking-tight text-white flex items-center">
                     Agenda de Tueste
                     <button
                        onClick={handlePurgeAll}
                        className="ml-4 px-3 py-1 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white text-[10px] font-bold uppercase tracking-widest rounded-md transition-all border border-red-500/30 flex items-center shadow-md active:scale-95"
                        title="Borrar toda la agenda de producción"
                     >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Reset Total
                     </button>
                  </h1>
                  <p className="text-sm text-gray-400 font-mono tracking-wide">SSOT: Planificación & Ejecución</p>
               </div>
            </div>

            <div className="flex bg-[#14161a] border border-dashboard-border rounded-lg p-1 w-full md:w-auto overflow-x-auto">
               <button
                  onClick={() => setViewMode('PLAN_MENSUAL')}
                  className={`flex-none px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all flex items-center justify-center ${viewMode === 'PLAN_MENSUAL' ? 'bg-gradient-to-r from-coffee-accent to-coffee-light text-white shadow ring-1 ring-coffee-light/50' : 'text-gray-500 hover:text-white'}`}
               >
                  <Package className="w-4 h-4 mr-2" />
                  Plan Mensual (Delegaciones)
               </button>
               <button
                  onClick={() => setViewMode('MANAGER')}
                  className={`flex-none px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all flex items-center justify-center ${viewMode === 'MANAGER' ? 'bg-[#1e222b] text-white shadow ring-1 ring-white/10' : 'text-gray-500 hover:text-gray-300'}`}
               >
                  <Settings className="w-4 h-4 mr-2 text-coffee-light" />
                  Agenda (Manual)
               </button>
               <button
                  onClick={() => setViewMode('OPERATOR')}
                  className={`flex-none px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all flex items-center justify-center ${viewMode === 'OPERATOR' ? 'bg-[#1e222b] text-blue-400 shadow ring-1 ring-blue-500/50' : 'text-gray-500 hover:text-blue-400/50'}`}
               >
                  <Cpu className="w-4 h-4 mr-2" />
                  Planta (Operario)
               </button>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto p-8 relative">
            {viewMode === 'PLAN_MENSUAL' ? (
               <div className="max-w-7xl mx-auto space-y-8">
                  <div className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-8 shadow-2xl">
                     <h2 className="text-2xl font-black text-white mb-2 uppercase tracking-wider flex items-center">
                        <Package className="w-6 h-6 mr-3 text-coffee-light" /> Previsión de Demanda: Delegaciones
                     </h2>
                     <p className="text-gray-400 text-sm mb-8">Inserta la petición mensual por delegación. El motor automático fraccionará el total en jornadas perfectas de 1600kg, agrupando por formato para agilizar los cambios de bobina de envasado.</p>
                     
                     {/* Demands Table */}
                     <div className="overflow-x-auto w-full mb-8 border border-dashboard-border rounded-xl">
                        <table className="w-full text-left text-sm text-gray-400">
                           <thead className="bg-[#14161a] text-xs uppercase text-gray-500 font-black tracking-widest border-b border-dashboard-border">
                              <tr>
                                 <th className="px-6 py-4">Delegación</th>
                                 <th className="px-6 py-4">Gama/Perfil</th>
                                 <th className="px-6 py-4">Formato Envasado</th>
                                 <th className="px-6 py-4">Demanda (Kg)</th>
                                 <th className="px-6 py-4 text-right">Quitar</th>
                              </tr>
                           </thead>
                           <tbody>
                              {demands.length === 0 && (
                                 <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-gray-600 font-bold tracking-widest uppercase">
                                       No hay demanda insertada. Utiliza el formulario inferior.
                                    </td>
                                 </tr>
                              )}
                              {demands.map(d => (
                                 <tr key={d.id} className="border-b border-dashboard-border/50 hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-bold text-white">{d.delegation}</td>
                                    <td className="px-6 py-4 text-coffee-light font-black">{d.profileName}</td>
                                    <td className="px-6 py-4"><span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded font-mono text-xs font-bold">{d.format}</span></td>
                                    <td className="px-6 py-4 font-mono font-bold text-white">{d.kgRequested} kg</td>
                                    <td className="px-6 py-4 text-right">
                                       <button onClick={() => handleRemoveDemand(d.id)} className="text-gray-500 hover:text-red-500 transition-colors">
                                          <Trash2 className="w-4 h-4 inline" />
                                       </button>
                                    </td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>

                     {/* Add Demand Form */}
                     <form onSubmit={handleAddDemand} className="bg-[#14161a] p-6 rounded-xl border border-dashboard-border flex flex-col lg:flex-row items-end gap-4 shadow-inner">
                        <div className="flex-1 w-full relative">
                           <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Delegación Destino</label>
                           <select required value={newDemand.delegation || ''} onChange={e => setNewDemand({...newDemand, delegation: e.target.value})}
                                   className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-coffee-light font-bold">
                              <option value="" disabled>-- Selecciona... --</option>
                              <option value="Madrid">Madrid</option>
                              <option value="Barcelona">Barcelona</option>
                              <option value="Valencia">Valencia</option>
                              <option value="Málaga">Málaga</option>
                              <option value="Granada">Granada</option>
                              <option value="Canarias">Canarias</option>
                           </select>
                        </div>
                        <div className="flex-1 w-full">
                           <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Perfil Requerido</label>
                           <select required value={newDemand.profileName || ''} 
                                   onChange={e => {
                                      const pName = e.target.value;
                                      let detectedFormat = newDemand.format || '1000g';
                                      
                                      // Automatic format detection (More robust matching)
                                      const normalizedName = pName.toLowerCase();
                                      if (normalizedName.includes('250')) detectedFormat = '250g';
                                      else if (normalizedName.includes('500')) detectedFormat = '500g';
                                      else if (normalizedName.includes('450')) detectedFormat = '450g';
                                      else if (normalizedName.includes('1 kg') || normalizedName.includes('1000')) detectedFormat = '1000g';

                                      const weight = getFormatWeight(detectedFormat);
                                      setNewDemand(prev => ({
                                         ...prev,
                                         profileName: pName,
                                         format: detectedFormat as any,
                                         totalPackages: Math.round((prev.kgRequested || 0) / weight)
                                      }));
                                   }}
                                   className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-coffee-light font-bold">
                              <option value="" disabled>Selecciona...</option>
                              {masterProfiles.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                           </select>
                        </div>
                        <div className="w-full lg:w-40 relative">
                           <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Formato</label>
                           <select required value={newDemand.format} 
                                   onChange={e => {
                                      const newFmt = e.target.value as any;
                                      const weight = getFormatWeight(newFmt);
                                      setNewDemand(prev => ({
                                         ...prev,
                                         format: newFmt,
                                         totalPackages: Math.round((prev.kgRequested || 0) / weight)
                                      }));
                                   }}
                                   className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg px-4 py-3 text-blue-400 focus:outline-none focus:border-blue-500 font-bold font-mono">
                              <option value="250g">250g</option>
                              <option value="450g">450g</option>
                              <option value="500g">500g</option>
                              <option value="1000g">1000g</option>
                              <option value="2KG">2KG</option>
                              <option value="GRANEL">GRANEL</option>
                           </select>
                        </div>
                        <div className="w-full lg:w-40 relative">
                           <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Total Kilos</label>
                           <input type="number" required min="1" step="0.1"
                                  value={newDemand.kgRequested || ''} 
                                  onChange={e => syncKgAndPackages('KG', Number(e.target.value), newDemand.format || '1000g')}
                                  className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg px-4 py-3 text-white font-mono focus:outline-none focus:border-coffee-light" />
                        </div>
                        <div className="w-full lg:w-40 relative">
                           <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Total Paquetes</label>
                           <input type="number" required min="1" step="1"
                                  value={newDemand.totalPackages || ''} 
                                  onChange={e => syncKgAndPackages('PKG', Number(e.target.value), newDemand.format || '1000g')}
                                  className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg px-4 py-3 text-yellow-500 font-mono focus:outline-none focus:border-yellow-500" />
                        </div>
                        <button type="submit" className="w-full lg:w-auto px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold tracking-widest uppercase rounded-lg border border-gray-600 transition-colors">
                           Añadir
                        </button>
                     </form>
                  </div>

                  {/* Submit AI Engine Button */}
                  <div className="flex justify-end p-4">
                     <button onClick={generateMonthlyPlan} className="bg-coffee-accent hover:bg-coffee-light text-white font-black uppercase tracking-[0.2em] px-10 py-5 rounded-2xl shadow-[0_0_30px_rgba(217,119,6,0.3)] transition-all flex items-center hover:scale-105 active:scale-95">
                        <Cpu className="w-6 h-6 mr-3" />
                        Arrancar Planificador de 1600kg/día
                     </button>
                  </div>

                  {/* Planned Days Output Grid */}
                  {plannedDays.length > 0 && (
                     <div className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-8 shadow-2xl mt-8">
                        <h3 className="text-xl font-black text-white mb-6 uppercase tracking-wider flex items-center border-b border-dashboard-border pb-4">
                           <ClipboardList className="w-5 h-5 mr-3 text-blue-400" /> Planificación Generada
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                           {plannedDays.map(day => (
                              <div key={day.dayIndex} className="bg-[#14161a] border border-dashboard-border rounded-2xl overflow-hidden flex flex-col group hover:border-blue-500/50 transition-colors">
                                 <div className="bg-gradient-to-r from-blue-900/30 to-[#14161a] p-4 border-b border-dashboard-border flex justify-between items-center">
                                    <div className="flex items-center space-x-2">
                                       <span className="font-black text-white tracking-widest uppercase">Plan M/</span>
                                       <input type="date" 
                                              value={day.scheduledDate || ''}
                                              onChange={(e) => {
                                                 const ns = [...plannedDays];
                                                 const tgt = ns.find(x => x.dayIndex === day.dayIndex);
                                                 if (tgt) tgt.scheduledDate = e.target.value;
                                                 setPlannedDays(ns);
                                              }}
                                              className="bg-[#1e222b] border border-dashboard-border text-white px-2 py-1 rounded text-xs focus:border-blue-500 outline-none" />
                                    </div>
                                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-1 rounded font-bold border border-blue-500/30">
                                       Silos {day.targetSilos.join(', ')}
                                    </span>
                                 </div>
                                 <div className="p-4 space-y-3 flex-1 max-h-64 overflow-y-auto">
                                    {day.blocks.map((b, i) => (
                                       <div key={i} className="flex justify-between items-center bg-[#1e222b] p-2 rounded-lg border border-dashboard-border">
                                          <div>
                                             <div className="text-xs font-bold text-coffee-light">{b.profileName}</div>
                                             <div className="text-[9px] text-gray-500 font-mono">FMT: {b.format}</div>
                                          </div>
                                          <div className="text-xs font-black text-white">{b.targetKg}kg</div>
                                       </div>
                                    ))}
                                 </div>
                                 <div className="p-4 bg-dashboard-bg border-t border-dashboard-border flex justify-between items-center">
                                    <div className="text-[11px] font-bold text-gray-400">TOTAL: <span className="text-white">{day.totalKg}</span> kg</div>
                                    <button onClick={() => handleLaunchDay(day)} className="bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-black uppercase tracking-widest px-3 py-2 rounded-lg transition-colors">
                                       Lanzar a Planta
                                    </button>
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}
               </div>
            ) : viewMode === 'MANAGER' ? (
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

                              {/* Target Kg vs Roasted input logic */}
                              <div>
                                 <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3">2. Perfil y Volumen (Tostado)</label>
                                 <div className="grid grid-cols-1 gap-4">
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
                                          placeholder="Kilos Tostados..."
                                       />
                                       <span className="text-gray-500 font-bold ml-2">kg</span>
                                    </div>
                                 </div>
                                 
                                 {selectedProfile && (
                                    <div className="mt-4">
                                       <p className="text-[11px] text-gray-400 mt-2 flex flex-col gap-1 bg-[#14161a] p-3 rounded-lg border border-dashboard-border">
                                          <span>🔹 Merma del perfil: <b className="text-coffee-light">{(SHRINKAGE_PCT * 100).toFixed(1)}%</b></span>
                                          <span>🔹 Requeriría <b className="text-gray-500">{(targetKg / (1 - SHRINKAGE_PCT)).toFixed(1)}kg</b> de verde matemáticamente.</span>
                                          <span>🔹 Verde exacto que tostará (siempre cargas de 2 sacos según origen): <b className="text-blue-400">{actualTotalGreenRoasting}kg</b></span>
                                          {excessRoasted > 0 && (
                                             <span className="text-yellow-500 font-bold">⚠️ Se generará un exceso de {excessRoasted.toFixed(1)}kg tostados debido al uso de múltiplos exactos de saco.</span>
                                          )}
                                       </p>
                                    </div>
                                 )}
                              </div>
                           </section>

                           {selectedProfile && (
                              <section className="bg-black/20 p-6 rounded-2xl border border-dashboard-border space-y-4">
                                 <div className="flex justify-between items-center text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-dashboard-border pb-2">
                                    <span>Desglose de Lotes por Origen</span>
                                    <Package className="w-3 h-3" />
                                 </div>
                                 <div className="space-y-3">
                                    {selectedProfile.blend.map((b, idx) => {
                                       const reqGreen = baseRequiredGreenKg * (b.percentage / 100);
                                       const batchSz = (b.sackWeight || 60) * 2;
                                       const batches = Math.ceil(reqGreen / batchSz);
                                       return (
                                          <div key={idx} className="flex flex-col bg-[#14161a] p-3 rounded-lg border border-dashboard-border">
                                             <div className="flex justify-between items-center mb-2">
                                                <span className="text-xs font-bold text-gray-300">{b.origin}</span>
                                                <span className="text-[10px] text-gray-400 font-bold bg-[#1e222b] px-2 py-0.5 rounded border border-dashboard-border">
                                                   {b.percentage}% ({(b.sackWeight || 60)}kg/saco)
                                                </span>
                                             </div>
                                             <div className="flex flex-wrap gap-2">
                                                {Math.ceil(reqGreen) > 0 ? Array.from({ length: batches }).map((_, i) => (
                                                   <div key={i} className="bg-coffee-accent/10 border border-coffee-accent/20 px-2 py-1 rounded text-center flex items-center">
                                                      <span className="text-coffee-light font-black text-[10px] mr-1.5">#{i+1}</span>
                                                      <span className="text-white font-bold text-[11px]">{batchSz}</span><span className="text-[9px] text-gray-500 ml-0.5">kg</span>
                                                   </div>
                                                )) : (
                                                   <span className="text-[10px] text-gray-500">Mínimo no alcanzado</span>
                                                )}
                                             </div>
                                          </div>
                                       );
                                    })}
                                 </div>
                              </section>
                           )}

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
                              {roastOrders.map((order, oIdx) => (
                                 <div key={`${order.id}-${oIdx}`} className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all hover:border-coffee-light/30">
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
                                          <div className="flex items-center space-x-3">
                                             <h3 className="text-lg font-black text-white">{order.profileName} <span className="text-coffee-light font-mono">{order.totalKg}kg</span></h3>
                                             {order.status === 'PLANNED' && viewMode === 'MANAGER' && (
                                                <button 
                                                   onClick={() => handleDeleteOrder(order.id)}
                                                   className="p-1.5 bg-[#14161a] border border-red-500/20 text-red-500 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-all shadow-md"
                                                   title="Eliminar Orden Planificada"
                                                >
                                                   <Trash2 className="w-4 h-4" />
                                                </button>
                                             )}
                                          </div>
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
                                                <div key={`${task.id}-${idx}`} className="flex flex-col bg-[#1e222b] px-4 py-2 rounded-lg border border-dashboard-border/50 text-sm overflow-hidden">
                                                   <div className="flex items-center justify-between">
                                                      <div className="flex items-center space-x-3 w-1/2">
                                                         <div className="w-6 h-6 rounded-full bg-dashboard-bg flex items-center justify-center text-[10px] font-black text-gray-500 border border-dashboard-border">
                                                            {idx + 1}
                                                         </div>
                                                         <div className="flex flex-col">
                                                            <span className="font-bold text-gray-300 truncate">
                                                               {task.type === 'ROAST' ? `Tostada ${task.batchIndex} de ${task.totalBatches}` : task.origins.join(' + ')}
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
                        const machine = ROASTING_MACHINES.find(m => m.id === task.machineId);
                        
                        // Validate that all required silos are assigned and have coffee
                        // const _isReadyToRoast = task.origins && task.assignedSilos && 
                        //                        task.assignedSilos.length === task.origins.length && 
                        //                        task.assignedSilos.every((sId: React.Key | null | undefined) => sId !== null && sId !== undefined);

                         // Special UI render for BLEND task (Resolves confusion of "1854kg as a Roast")
                         if (task.type === 'BLEND') {
                            return (
                               <div key={`${task.id}-${idx}`} className="bg-dashboard-panel border-2 border-green-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col group hover:border-green-500/50 transition-all">
                                  <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                                  
                                  <div className="flex justify-between items-start mb-4">
                                     <div className="bg-green-500/10 px-3 py-1 rounded-lg border border-green-500/30 text-[10px] font-black text-green-400 uppercase tracking-widest">
                                        RESUMEN DE ENSAMBLAJE FINAL
                                     </div>
                                  </div>

                                  <div className="mb-4">
                                     <h3 className="text-xl font-black text-white leading-tight mb-1 truncate">{task.parentProfile}</h3>
                                     <div className="text-xs text-green-400 font-bold uppercase tracking-widest">
                                        <Package className="w-4 h-4 inline mr-1" />
                                        Módulo de Envasado / Mezcladora
                                     </div>
                                  </div>

                                  <div className="bg-[#14161a] p-4 rounded-xl border border-dashboard-border text-center mb-6">
                                     <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1">TOTAL CAFÉ TOSTADO PREVISTO</span>
                                     <span className="text-2xl font-black text-coffee-light">{(task.targetWeightKg || 0).toFixed(1)}kg</span>
                                  </div>

                                  <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4 mb-6">
                                     <span className="text-[9px] font-black text-gray-500 uppercase tracking-tighter border-b border-green-500/20 pb-1 block mb-3">Silos Vinculados a esta Gama</span>
                                     <div className="space-y-2">
                                        {Array.from(new Set(task.assignedSilos)).map((sId: any, sIdx: number) => {
                                           const assignedSiloObj = silos.find(s => s.id === sId);
                                           return (
                                              <div key={sIdx} className="flex justify-between items-center bg-[#1e222b] p-2 rounded-lg border border-dashboard-border/50">
                                                 <div className="flex items-center space-x-2">
                                                    <Database className="w-3 h-3 text-green-500" />
                                                    <span className="text-xs text-white font-bold">Silo {assignedSiloObj?.id || sId}</span>
                                                 </div>
                                                 <span className="text-[10px] text-gray-400 truncate w-24">({assignedSiloObj?.origin || 'Origen'})</span>
                                              </div>
                                           );
                                        })}
                                     </div>
                                  </div>

                                  <button
                                     onClick={() => {
                                        alert("Confirmando cierre de Gama. Envíando orden a Envasadora...");
                                        onLaunchManualRoast(task);
                                     }}
                                     className="w-full py-4 rounded-xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center space-x-3 bg-green-600/20 border border-green-500 hover:bg-green-600 text-white shadow-lg active:scale-95"
                                  >
                                     <CheckCircle className="w-5 h-5" />
                                     <span>CONFIRMAR CIERRE</span>
                                  </button>
                               </div>
                            );
                         }

                         return (
                            <div key={`${task.id}-${idx}`} className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col group hover:border-blue-500/50 transition-all">
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
                                  <h3 className="text-xl font-black text-white leading-tight mb-2 truncate" title={task.parentProfile}>{task.parentProfile}</h3>
                                  <div className="flex items-center space-x-2 text-xs text-coffee-light font-bold uppercase tracking-widest">
                                     <Target className="w-4 h-4 shrink-0" />
                                     <span className="truncate">{task.origins ? task.origins.join(' + ') : 'Blend'}</span>
                                  </div>
                               </div>

                               <div className="grid grid-cols-2 gap-4 mb-8">
                                  <div className="bg-[#14161a] p-3 rounded-xl border border-dashboard-border text-center">
                                     <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">MÁQUINA</span>
                                     <span className="text-sm font-black text-white">{machine?.name || task.machineId || 'TOST-A'}</span>
                                  </div>
                                  <div className="bg-[#14161a] p-3 rounded-xl border border-dashboard-border text-center">
                                     <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest block mb-1">CARGA VERDE</span>
                                     <span className="text-sm font-black text-coffee-light">{(task.targetWeightKg || 0).toFixed(1)}kg</span>
                                  </div>
                               </div>

                               <div className="bg-blue-600/10 border border-blue-500/30 rounded-2xl p-4 mb-6 flex flex-col space-y-3">
                                  <span className="text-[9px] font-black text-gray-500 uppercase tracking-tighter border-b border-blue-500/20 pb-1">Suministro a Silo de Destino</span>
                                  
                                  {task.origins?.map((org: string, orgIdx: number) => {
                                     const sId = task.assignedSilos ? task.assignedSilos[0] : null; // Asumiremos 1 silo de destino por tarea en este flujo industrial
                                     const assignedSiloObj = silos.find(s => s.id === sId);
                                     return (
                                        <div key={orgIdx} className="flex items-center justify-between">
                                           <div className="flex items-center space-x-3">
                                              <Database className="w-4 h-4 text-blue-400" />
                                              <div className="flex flex-col">
                                                 <span className="text-[10px] text-gray-400 truncate w-24 md:w-32" title={org}>{org}</span>
                                                 <span className="text-xs font-black text-white">
                                                    {assignedSiloObj ? `Silo Destino: ${assignedSiloObj.id}` : 'SIN ASIGNAR'}
                                                 </span>
                                              </div>
                                           </div>
                                           {assignedSiloObj ? <CheckCircle className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-orange-500" />}
                                        </div>
                                     )
                                  })}
                               </div>

                               <button
                                  onClick={() => onLaunchManualRoast(task)}
                                  // disabled={!isReadyToRoast} (Disabled temporarily to ensure the mock industrial flow never crashes)
                                  className={`w-full py-4 rounded-xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center space-x-3 
                                     bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)] active:scale-95`}
                               >
                                  <Flame className="w-5 h-5 mr-3" />
                                  <span>INICIAR TUESTE</span>
                              </button>
                           </div>
                        );
                     })}

                     {pendingTasks.length === 0 ? (
                        <div className="col-span-full border-2 border-dashed border-dashboard-border rounded-[48px] p-24 flex flex-col items-center justify-center text-center opacity-40">
                           <ClipboardList className="w-24 h-24 mb-6 text-gray-600" />
                           <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Cola de Tareas Vacía</h2>
                           <p className="text-gray-500 font-bold max-w-sm">No hay tuestes planificados para esta sesión. Consulte con el Jefe de Producto para recibir órdenes de producción.</p>
                        </div>
                     ) : null}
                  </div>
               </div>
            )}
         </div>
      </div>
   );
};

export default DailyRoastOrders;