import React, { useState } from 'react';
import type { MasterProfile, DailyRoastOrder, RoastTask, OrderCategory } from '../App';
import { Database, Settings, Cpu, QrCode, Plus, Package, Target, CheckCircle, Flame, Trash2, ClipboardList, AlertTriangle, FileText, Zap, Lock, Boxes, Calendar, ArrowUp, ArrowDown, History, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { generateDailyProductionReport, generatePackagingOrderReport, generatePalletShippingReport, generateRoastingPlanReport, generateSingleDayPlanReport } from '../lib/reports';
import { ROASTING_MACHINES } from '../App';
import { createDailyOrder, deleteDailyOrder, purgeAllProductionData, fetchPlannerDemands, createPlannerDemand, deletePlannerDemand, fetchPlannerDays, createPlannerDay, deletePlannerDay, purgePlannerDays, updatePlannerDemandStatus, fetchMonthlySurplus, createMonthlySurplus, deleteMonthlySurplus, fetchMonthlyHistory, saveMonthlyHistory, deleteMonthlyHistory, getOriginSackWeight } from '../lib/api';
import type { MonthlyPlanHistory } from '../lib/api';
import type { MonthlySurplus } from '../lib/api';
import PackagingOverlay from './PackagingOverlay';

interface DailyRoastOrdersProps {
   masterProfiles: MasterProfile[];
   roastOrders: DailyRoastOrder[];
   setRoastOrders: React.Dispatch<React.SetStateAction<DailyRoastOrder[]>>;
   silos: any[];
   setSilos: React.Dispatch<React.SetStateAction<any[]>>;
   onLaunchManualRoast: (task: RoastTask) => void;
   forceView?: 'PLAN_MENSUAL' | 'MANAGER' | 'OPERATOR' | 'PACKAGING';
}

interface DelegationDemand {
   id: string;
   delegation: string;
   profileName: string;
   format: '250g' | '450g' | '500g' | '1000g' | '2KG' | 'GRANEL';
   kgRequested: number;
   totalPackages?: number;
   status?: 'PENDING' | 'PRODUCING' | 'COMPLETED' | 'REVIEWED';
}

export interface DailyPlan {
   dayIndex: number;
   targetSilos: number[]; // e.g [1,2,3,4] or [5,6,7,8]
   siloAssignments: { siloId: number, origin: string, batches: { profileName: string, format: string }[] }[];
   totalKg: number;
   blocks: { profileName: string, format: string, targetKg: number }[];
   scheduledDate?: string;
   fulfilledDemandIds?: string[];
}

const DailyRoastOrders: React.FC<DailyRoastOrdersProps> = ({ masterProfiles, roastOrders, setRoastOrders, silos, setSilos, onLaunchManualRoast, forceView }) => {
   const [viewMode, setViewMode] = useState<'PLAN_MENSUAL' | 'MANAGER' | 'OPERATOR' | 'PACKAGING'>(forceView || 'MANAGER');

   React.useEffect(() => {
      if (forceView) setViewMode(forceView);
   }, [forceView]);

   // Phase 20: Packaging Core State
   const [activePackagingTask, setActivePackagingTask] = useState<any>(null);
      
   // Planificador Mensual State
   const [demands, setDemands] = useState<DelegationDemand[]>([]);
   const [plannedDays, setPlannedDays] = useState<DailyPlan[]>([]);
   const [newDemand, setNewDemand] = useState<Partial<DelegationDemand>>({
      delegation: 'Canarias',
      format: '1000g',
      kgRequested: 1890,
      totalPackages: 1890
   });

   // Control Mensual de Sobrantes (Cajas y Paquetes ya Fabricados)
   const currentMonthName = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date());
   const defaultMonthStr = currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);
   const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonthStr);
   const [surplusList, setSurplusList] = useState<MonthlySurplus[]>([]);
   const [newSurplus, setNewSurplus] = useState({
      profileName: '',
      format: '1000g',
      boxes: 0,
      packages: 0
   });

   // Histórico Mensual y Validación
   const [plannerTab, setPlannerTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
   const [historyList, setHistoryList] = useState<MonthlyPlanHistory[]>([]);
   const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
   const [showValidateModal, setShowValidateModal] = useState<boolean>(false);

   React.useEffect(() => {
      const loadPlannerData = async () => {
         const [dbDemands, dbDays, dbSurplus, dbHistory] = await Promise.all([
            fetchPlannerDemands(),
            fetchPlannerDays(),
            fetchMonthlySurplus(selectedMonth),
            fetchMonthlyHistory()
         ]);
         setDemands(dbDemands as any[]);
         setPlannedDays(dbDays as any[]);
         setSurplusList(dbSurplus || []);
         setHistoryList(dbHistory || []);
      };
      loadPlannerData();
   }, [selectedMonth]);

   const handleConfirmValidation = async () => {
      if (plannedDays.length === 0) return;

      let totalGreenKg = 0;
      let totalSacks = 0;
      plannedDays.forEach(day => {
         day.siloAssignments.forEach(silo => {
            silo.batches.forEach(batch => {
               const sackWeight = getOriginSackWeight(silo.origin, batch.profileName, masterProfiles);
               totalGreenKg += sackWeight * 2;
               totalSacks += 2;
            });
         });
      });

      const totalRoasted = Number(plannedDays.reduce((acc, d) => acc + d.totalKg, 0).toFixed(1));

      const record: MonthlyPlanHistory = {
         id: `HIST-${Date.now()}`,
         month: selectedMonth,
         validatedAt: new Date().toISOString(),
         totalDays: plannedDays.length,
         totalKg: totalRoasted,
         totalGreenKg: Number(totalGreenKg.toFixed(1)),
         totalSacks,
         days: JSON.parse(JSON.stringify(plannedDays)),
         demands: JSON.parse(JSON.stringify(demands.filter(d => d.status !== 'COMPLETED' && d.status !== 'REVIEWED'))),
         surplus: JSON.parse(JSON.stringify(surplusList))
      };

      await saveMonthlyHistory(record);
      setHistoryList(prev => [record, ...prev.filter(h => h.id !== record.id)]);

      // Mark demands as COMPLETED
      demands.forEach(d => {
         if (d.status !== 'COMPLETED') {
            updatePlannerDemandStatus(d.id, 'COMPLETED');
         }
      });

      // Clear active planned days
      await purgePlannerDays();
      setPlannedDays([]);

      setShowValidateModal(false);
      setPlannerTab('HISTORY');
   };

   const handleDeleteHistory = async (id: string) => {
      if (!confirm("¿Seguro que deseas eliminar esta planificación validada del histórico?")) return;
      await deleteMonthlyHistory(id);
      setHistoryList(prev => prev.filter(h => h.id !== id));
   };

   const getUnitsPerBox = (format: string): number => {
      switch (format) {
         case '250g': return 40;
         case '450g': return 20;
         case '500g': return 20;
         case '1000g': return 10;
         case '2KG': return 5;
         default: return 10;
      }
   };

   const calculateSurplusKg = (format: string, boxes: number, packages: number): number => {
      const weight = getFormatWeight(format);
      const unitsPerBox = getUnitsPerBox(format);
      const totalUnits = (Number(boxes || 0) * unitsPerBox) + Number(packages || 0);
      return Number((totalUnits * weight).toFixed(2));
   };

   const handleAddSurplus = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newSurplus.profileName) {
         alert("Por favor selecciona una gama / perfil.");
         return;
      }
      const totalKg = calculateSurplusKg(newSurplus.format, newSurplus.boxes, newSurplus.packages);
      if (totalKg <= 0) {
         alert("Introduce una cantidad de cajas o paquetes mayor que cero.");
         return;
      }

      const surplusItem: MonthlySurplus = {
         id: `SURPLUS-${Date.now()}`,
         month: selectedMonth,
         profileName: newSurplus.profileName,
         format: newSurplus.format,
         boxes: Number(newSurplus.boxes || 0),
         packages: Number(newSurplus.packages || 0),
         totalKg
      };

      const success = await createMonthlySurplus(surplusItem);
      if (success) {
         setSurplusList(prev => [...prev.filter(s => !(s.profileName === surplusItem.profileName && s.format === surplusItem.format && s.month === selectedMonth)), surplusItem]);
         setNewSurplus(prev => ({ ...prev, boxes: 0, packages: 0 }));
      }
   };

   const handleRemoveSurplus = async (id: string) => {
      const success = await deleteMonthlySurplus(id);
      if (success) {
         setSurplusList(prev => prev.filter(s => s.id !== id));
      }
   };

   const handleMoveDay = (dayIndex: number, direction: 'UP' | 'DOWN') => {
      const idx = plannedDays.findIndex(d => d.dayIndex === dayIndex);
      if (idx === -1) return;
      const targetIdx = direction === 'UP' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= plannedDays.length) return;

      const newDays = [...plannedDays];
      const temp = newDays[idx];
      newDays[idx] = newDays[targetIdx];
      newDays[targetIdx] = temp;

      const reIndexed = newDays.map((d, i) => ({
         ...d,
         dayIndex: i + 1,
         targetSilos: (i + 1) % 2 === 1 ? [1, 2, 3, 4] : [5, 6, 7, 8]
      }));

      setPlannedDays(reIndexed);
      purgePlannerDays().then(() => {
         reIndexed.forEach(d => createPlannerDay(d));
      });
   };

   const handleDeleteDay = (dayIndex: number) => {
      if (!confirm(`¿Eliminar la jornada planificada #${dayIndex}?`)) return;
      const filtered = plannedDays.filter(d => d.dayIndex !== dayIndex);
      const reIndexed = filtered.map((d, i) => ({
         ...d,
         dayIndex: i + 1,
         targetSilos: (i + 1) % 2 === 1 ? [1, 2, 3, 4] : [5, 6, 7, 8]
      }));
      setPlannedDays(reIndexed);
      purgePlannerDays().then(() => {
         reIndexed.forEach(d => createPlannerDay(d));
      });
   };

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
      .flatMap(o => o.tasks.map(t => {
         // Fix: For BLEND tasks, only show silos that actually contain its origins
         let displaySilos = t.assignedSilos;
         if (t.type === 'BLEND') {
            const profileSilos = Array.from(new Set(
               o.tasks
                  .filter(rt => rt.type === 'ROAST' && rt.masterProfile?.name === t.masterProfile?.name)
                  .flatMap(rt => rt.assignedSilos || [])
            )).sort((a,b) => a-b);
            if (profileSilos.length > 0) displaySilos = profileSilos;
         }

         return { 
            ...t, 
            assignedSilos: displaySilos,
            parentOrderPriority: o.priority, 
            parentProfile: t.masterProfile?.name || o.profileName, 
            parentBusinessUnit: (t.masterProfile as any)?.businessUnit || (o.tasks[0]?.masterProfile as any)?.businessUnit 
         };
      }))
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

   const selectedProfile = masterProfiles.find(p => p?.name === selectedProfileName);

   const SHRINKAGE_PCT = selectedProfile ? ((selectedProfile.expectedShrinkage || 16.0) / 100) : 0.16;

   
   // Base theoretical minimum
   const baseRequiredGreenKg = targetKg / (1 - SHRINKAGE_PCT);
   
   // True green sum enforcing exactly 2 Sacks per batch per origin
   let actualTotalGreenRoasting = 0;
   if (selectedProfile) {
      selectedProfile.blend.forEach(b => {
         const originReqGreen = baseRequiredGreenKg * (b.percentage / 100);
         const originSackWeight = Number(b.sackWeight || (b as any).sack_weight || 60);
         const originBatchSize = originSackWeight * 2;
         const batchesNeeded = Math.max(1, Math.ceil(originReqGreen / originBatchSize));
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

      if (!confirm(`Para fabricar ${targetKg}kg de ${selectedProfile?.name} (Merma del ${(SHRINKAGE_PCT * 100).toFixed(1)}%):\nLa agenda forzará tandas cerradas de 2 SACOS según el origen (ej. 120kg o 138kg).\n\nTotal Café Verde que procesarás: ${actualTotalGreenRoasting}kg.\nEl rendimiento final que obtendrás será aprox de ${trueEstimatedRoasted.toFixed(1)}kg tostados.\n\nSobrarán: ${excessRoasted > 0 ? excessRoasted.toFixed(1) : 0}kg tostados que irán al silo de reserva.\n\n¿Proceder con la generación de tareas?`)) {
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
         profileName: selectedProfile?.name,
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
      await purgePlannerDays();
      // Demands are intentionally kept so they don't have to be re-entered if the user just wants to purge the execution agenda
      
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

      createPlannerDemand(demand).then((success) => {
         if(success) setDemands([...demands, demand]);
      });
      
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
      deletePlannerDemand(id).then(success => {
         if(success) setDemands(demands.filter(d => d.id !== id));
      });
   };

   const generateMonthlyPlan = () => {
      if (demands.length === 0) {
         alert("La tabla de demanda está vacía. Añade previsiones primero.");
         return;
      }

      // 1. Group demands by Profile + Format (Independent Lines)
      let queue: { profileName: string, format: string, totalKg: number, grossKg: number, surplusKg: number, demandIds: string[] }[] = [];
      demands.filter(d => d.status !== 'COMPLETED' && d.status !== 'REVIEWED').forEach(d => {
         const existing = queue.find(g => g.profileName === d.profileName && g.format === d.format);
         if (existing) {
            existing.totalKg += d.kgRequested;
            existing.demandIds.push(d.id);
         } else {
            queue.push({ profileName: d.profileName, format: d.format, totalKg: d.kgRequested, grossKg: d.kgRequested, surplusKg: 0, demandIds: [d.id] });
         }
      });

      // 1.1 Descontar stock sobrante ya fabricado (cajas y paquetes)
      let totalDeductedKg = 0;
      queue.forEach(item => {
         item.grossKg = item.totalKg;
         const matchedSurplus = surplusList.filter(s => s.profileName === item.profileName && s.format === item.format);
         const availableSurplusKg = matchedSurplus.reduce((acc, s) => acc + s.totalKg, 0);
         item.surplusKg = availableSurplusKg;
         if (availableSurplusKg > 0) {
            const deduction = Math.min(item.totalKg, availableSurplusKg);
            totalDeductedKg += deduction;
            item.totalKg = Math.max(0, Number((item.totalKg - deduction).toFixed(1)));
         }
      });

      // Filtrar items con totalKg = 0 (100% cubiertos por stock sobrante existente)
      const itemsToRoast = queue.filter(item => item.totalKg > 0);
      if (itemsToRoast.length === 0 && queue.length > 0) {
         alert(`¡Toda la demanda mensual (${totalDeductedKg} kg) está cubierta al 100% con los sobrantes y cajas ya fabricadas! No es necesario tostar más café.`);
         return;
      }
      queue = itemsToRoast;

      // Pick highest volume -> then all same format -> then next highest...
      const sortedQueue: { profileName: string, format: string, totalKg: number, demandIds: string[] }[] = [];
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
      let currentDayFulfilledIds: string[] = [];

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
               blocks: currentDayBlocks.map(b => ({ ...b, targetKg: Number(b.targetKg.toFixed(1)) })),
               fulfilledDemandIds: Array.from(new Set(currentDayFulfilledIds))
            });
            dayIdx++;
            currentDaySiloAssignments = [];
            currentDayBlocks = [];
            currentDayFulfilledIds = [];
         }
      };

      sortedQueue.forEach(item => {
         const profile = masterProfiles.find(p => p?.name === item.profileName);
         if (!profile) return;

         // Accumulate demand IDs into the current day
         currentDayFulfilledIds.push(...item.demandIds);

         const shrinkage = (profile.expectedShrinkage || 16) / 100;

         // To balance origins across Daily silos, we generate SINGLE batches and interleave them 
         // so that silos are created and filled in proportion to the blend percentage.
         interface PendingBatch { origin: string; score: number; component: any; batchSizeRoasted: number; }
         const itemBatches: PendingBatch[] = [];

         profile.blend.forEach(component => {
            const targetRoastedForThisOrigin = item.totalKg * (component.percentage / 100);
            const sackWeight = Number(component.sackWeight || (component as any).sack_weight) || getOriginSackWeight(component.origin, profile.name, masterProfiles);
            const batchSizeGreen = sackWeight * 2;
            const batchSizeRoasted = batchSizeGreen * (1 - shrinkage);
            
            const batchesNeeded = Math.max(1, Math.ceil(targetRoastedForThisOrigin / batchSizeRoasted));
            
            for (let i = 0; i < batchesNeeded; i++) {
               itemBatches.push({
                  origin: component.origin,
                  score: i / batchesNeeded, // distribute evenly 0.0 to 1.0
                  component,
                  batchSizeRoasted
               });
            }
         });

         // Sort to perfectly interleave batches of different origins based on their progress ratio
         itemBatches.sort((a, b) => a.score - b.score);

         // --- PREVENT SPLITTING SMALL ORDERS ACROSS DAYS ---
         // If a profile order is relatively small (<= 16 batches, meaning it could fit in a single 4-silo day)
         // we simulate if it will fit in the REMAINING capacity of the current day.
         // If it won't fit perfectly without bridging to the next day, we proactively flush the day early
         // so this product starts fresh and stays fully contained in a single day for blending safely.
         if (itemBatches.length <= 16 && currentDaySiloAssignments.length > 0) {
            let willFit = true;
            // Create a lightweight simulation array of current capacities
            let simSilos = currentDaySiloAssignments.map(s => ({ origin: s.origin, count: s.batches.length }));
            
            for (const batchDef of itemBatches) {
               let targetSim = simSilos.find(s => s.origin === batchDef.origin && s.count < 4);
               if (!targetSim) {
                  if (simSilos.length >= 4) {
                     willFit = false;
                     break;
                  }
                  simSilos.push({ origin: batchDef.origin, count: 1 });
               } else {
                  targetSim.count++;
               }
            }

            // Check if adding all these batches would exceed the 1800 kg limit if it becomes a multi-gama day
            const currentWeight = currentDayBlocks.reduce((acc, b) => acc + b.targetKg, 0);
            const totalItemWeight = itemBatches.reduce((acc, b) => acc + b.batchSizeRoasted, 0);
            const uniqueGamasSim = new Set(currentDayBlocks.map(b => b.profileName));
            uniqueGamasSim.add(item.profileName);
            if (uniqueGamasSim.size >= 2 && currentWeight + totalItemWeight > 1800) {
               willFit = false;
            }

            if (!willFit) {
               // Only flush early if the day is already reasonably full (e.g. >= 1400 kg),
               // otherwise do NOT flush early to optimize roasting days and avoid leaving days half-empty.
               if (currentWeight >= 1400) {
                  flushDay();
               }
            }
         }

         // Process interleaved batches into Daily Silos
         itemBatches.forEach(batchDef => {
            // Find existing silo for this origin on current day that has space
            let silo = currentDaySiloAssignments.find(s => s.origin === batchDef.origin && s.batches.length < 4);
            
            // Check weight limit if adding this batch
            const currentWeight = currentDayBlocks.reduce((acc, b) => acc + b.targetKg, 0);
            const uniqueGamas = new Set(currentDayBlocks.map(b => b.profileName));
            uniqueGamas.add(item.profileName);
            
            const wouldExceedCap = uniqueGamas.size >= 2 && (currentWeight + batchDef.batchSizeRoasted > 1800);

            if (!silo || wouldExceedCap) {
               if (currentDaySiloAssignments.length >= 4 || wouldExceedCap) {
                  flushDay();
                  // Re-evaluate silo on the new day (which is empty)
                  silo = undefined;
               }
               
               if (!silo) {
                  const nextIdx = currentDaySiloAssignments.length;
                  const siloSet = dayIdx % 2 === 1 ? [1, 2, 3, 4] : [5, 6, 7, 8];
                  silo = { siloId: siloSet[nextIdx], origin: batchDef.origin, batches: [] };
                  currentDaySiloAssignments.push(silo);
               }
            }

            silo.batches.push({ profileName: item.profileName, format: item.format });
            
            // Track this block's actual roasted weight
            const existingBlock = currentDayBlocks.find(b => b.profileName === item.profileName && b.format === item.format);
            if (existingBlock) {
               existingBlock.targetKg += batchDef.batchSizeRoasted;
            } else {
               currentDayBlocks.push({ profileName: item.profileName, format: item.format, targetKg: batchDef.batchSizeRoasted });
            }
         });
      });

      flushDay();

      // Wipe old plan and save the new one
      purgePlannerDays().then(() => {
         computedDays.forEach(day => createPlannerDay(day));
         setPlannedDays(computedDays);
      });
   };

   const handleLaunchDay = async (day: DailyPlan) => {
      const parentOrderId = `PLAN-${day.scheduledDate || 'D' + day.dayIndex}-${Date.now().toString().slice(-4)}`;
      const newTasks: RoastTask[] = [];

      // Sort siloAssignments by origin to ensure correlative roasting
      const sortedAssignments = [...day.siloAssignments].sort((a, b) => a.origin.localeCompare(b.origin));

        let globalTaskCounter = 1;
        const totalTasksInSession = sortedAssignments.reduce((acc, s) => acc + s.batches.length, 0) + day.blocks.length;

        // 1. Generate ROAST tasks from Sorted Silo Assignments
        sortedAssignments.forEach((silo) => {
           silo.batches.forEach((batchInfo, bIdx) => {
              const profile = masterProfiles.find(p => p?.name === batchInfo.profileName);
              if (!profile) return;
              const blendComponent = profile.blend.find(b => b.origin === silo.origin);
              const sackWeight = Number(blendComponent?.sackWeight || (blendComponent as any)?.sack_weight || 60);
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
                 batchIndex: globalTaskCounter++,
                 totalBatches: totalTasksInSession,
                 parentOrderTotalKg: day.totalKg,
                 assignedSilos: [silo.siloId]
              });
           });
        });

        // 2. Generate BLEND tasks for each profile block in the day
        day.blocks.forEach((block, blIdx) => {
           const profile = masterProfiles.find(p => p?.name === block.profileName);
           if (!profile) return;

           // Dynamically detect which silos actually contain this profile's origins
           const actualSilos = sortedAssignments
              .filter(s => s.batches.some(b => b.profileName === block.profileName))
              .map(s => s.siloId);

           newTasks.push({
              id: `${parentOrderId}-BLEND-${blIdx + 1}`,
              parentOrderId,
              type: 'BLEND',
              masterProfile: profile,
              origins: profile.blend.map(b => b.origin),
              targetWeightKg: block.targetKg,
              status: 'PENDING',
              category: 'MARCA_PROPIA',
              batchIndex: globalTaskCounter++,
              totalBatches: totalTasksInSession,
              assignedSilos: actualSilos,
              fulfilledDemandIds: day.fulfilledDemandIds || []
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

      // Mark demands as PRODUCING
      if (day.fulfilledDemandIds) {
         for (const dId of day.fulfilledDemandIds) {
            await updatePlannerDemandStatus(dId, 'PRODUCING');
         }
      }

      setRoastOrders([...roastOrders, newOrder]);
      setPlannedDays(plannedDays.filter(d => d.dayIndex !== day.dayIndex));
      deletePlannerDay(day.dayIndex);
      
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
               <button
                  onClick={() => setViewMode('PACKAGING')}
                  className={`flex-none px-6 py-2 text-xs font-bold uppercase tracking-widest rounded-md transition-all flex items-center justify-center ${viewMode === 'PACKAGING' ? 'bg-[#1e222b] text-green-400 shadow ring-1 ring-green-500/50' : 'text-gray-500 hover:text-green-400/50'}`}
               >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Ejecución de Planta
               </button>
            </div>
         </div>

         <div className="flex-1 overflow-y-auto p-8 relative">
            {viewMode === 'PLAN_MENSUAL' ? (
               <div className="max-w-7xl mx-auto space-y-8">
                  {/* Pestañas Superiores: Planificador Activo vs Histórico Mensual */}
                  <div className="flex items-center justify-between border-b border-dashboard-border pb-4">
                     <div className="flex items-center space-x-3">
                        <button
                           onClick={() => setPlannerTab('ACTIVE')}
                           className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center ${plannerTab === 'ACTIVE' ? 'bg-coffee-accent text-white shadow-lg' : 'bg-[#14161a] text-gray-400 hover:text-white border border-dashboard-border'}`}
                        >
                           <Package className="w-4 h-4 mr-2" /> Planificador Activo
                        </button>
                        <button
                           onClick={() => setPlannerTab('HISTORY')}
                           className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center ${plannerTab === 'HISTORY' ? 'bg-coffee-accent text-white shadow-lg' : 'bg-[#14161a] text-gray-400 hover:text-white border border-dashboard-border'}`}
                        >
                           <History className="w-4 h-4 mr-2" /> Histórico Mensual
                           <span className="ml-2 bg-[#1e222b] px-2 py-0.5 rounded text-[10px] font-mono text-gray-300 border border-dashboard-border">
                              {historyList.length}
                           </span>
                        </button>
                     </div>
                  </div>

                  {plannerTab === 'HISTORY' ? (
                     /* VISTA: HISTÓRICO MENSUAL DE PEDIDOS / PLANES VALIDADOS */
                     <div className="space-y-6">
                        <div className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-8 shadow-2xl">
                           <div className="flex justify-between items-center border-b border-dashboard-border pb-4 mb-6">
                              <div>
                                 <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center">
                                    <History className="w-6 h-6 mr-3 text-coffee-light" /> Histórico de Planificaciones Validadas
                                 </h2>
                                 <p className="text-gray-400 text-xs mt-1">
                                    Consulta los meses anteriores validados y vuelve a descargar sus hojas de trabajo en PDF en cualquier momento.
                                 </p>
                              </div>
                           </div>

                           {historyList.length === 0 ? (
                              <div className="text-center py-16 text-gray-500 text-sm">
                                 <History className="w-12 h-12 mx-auto mb-3 opacity-30 text-gray-400" />
                                 No hay planificaciones validadas en el histórico todavía.
                                 <p className="text-xs text-gray-600 mt-1">Cuando valides una planificación mensual generada, aparecerá registrada aquí.</p>
                              </div>
                           ) : (
                              <div className="space-y-6">
                                 {historyList.map(record => {
                                    const isExpanded = expandedHistoryId === record.id;
                                    const formattedDate = new Date(record.validatedAt).toLocaleDateString('es-ES', {
                                       day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                    });

                                    return (
                                       <div key={record.id} className="bg-[#14161a] border border-dashboard-border rounded-2xl p-6 shadow-xl space-y-4 hover:border-dashboard-border/80 transition-all">
                                          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-dashboard-border/50 pb-4">
                                             <div>
                                                <div className="flex items-center space-x-3">
                                                   <h3 className="text-lg font-black text-white uppercase tracking-wider">{record.month}</h3>
                                                   <span className="bg-green-500/10 border border-green-500/30 text-green-400 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full flex items-center">
                                                      <CheckCircle2 className="w-3 h-3 mr-1" /> Validado
                                                   </span>
                                                </div>
                                                <span className="text-[11px] text-gray-400 font-mono mt-0.5 block">
                                                   Validado el {formattedDate}
                                                </span>
                                             </div>

                                             <div className="flex items-center space-x-2 flex-wrap gap-2">
                                                <button
                                                   onClick={() => generateRoastingPlanReport(record.days, masterProfiles, record.month)}
                                                   className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase px-4 py-2 rounded-xl flex items-center shadow transition-all active:scale-95"
                                                   title="Descargar Plan Completo PDF"
                                                >
                                                   <FileText className="w-4 h-4 mr-1.5" /> Exportar PDF
                                                </button>
                                                <button
                                                   onClick={() => setExpandedHistoryId(isExpanded ? null : record.id)}
                                                   className="bg-[#1e222b] hover:bg-gray-800 text-gray-300 text-xs font-bold px-3 py-2 rounded-xl flex items-center border border-dashboard-border transition-colors"
                                                >
                                                   {isExpanded ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                                                   {isExpanded ? 'Ocultar Jornadas' : 'Ver Jornadas'}
                                                </button>
                                                <button
                                                   onClick={() => handleDeleteHistory(record.id)}
                                                   className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                                                   title="Eliminar del histórico"
                                                >
                                                   <Trash2 className="w-4 h-4" />
                                                </button>
                                             </div>
                                          </div>

                                          {/* Resumen de Métricas */}
                                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#1e222b] p-4 rounded-xl border border-dashboard-border">
                                             <div>
                                                <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest block">Jornadas</span>
                                                <span className="text-base font-black text-white font-mono">{record.totalDays} días</span>
                                             </div>
                                             <div>
                                                <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest block">Tostado Neto</span>
                                                <span className="text-base font-black text-coffee-light font-mono">{record.totalKg.toLocaleString()} kg</span>
                                             </div>
                                             <div>
                                                <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest block">Café Verde</span>
                                                <span className="text-base font-black text-yellow-500 font-mono">{record.totalGreenKg.toLocaleString()} kg</span>
                                             </div>
                                             <div>
                                                <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest block">Sacos (60kg)</span>
                                                <span className="text-base font-black text-green-400 font-mono">{record.totalSacks} sacos</span>
                                             </div>
                                          </div>

                                          {/* Desplegable con detalle de jornadas del mes */}
                                          {isExpanded && (
                                             <div className="pt-2 space-y-3 border-t border-dashboard-border/40">
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-wider">Detalle de las {record.days.length} Jornadas de {record.month}:</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                   {record.days.map((day: any) => (
                                                      <div key={day.dayIndex} className="bg-[#121417] border border-dashboard-border rounded-xl p-3.5 space-y-2">
                                                         <div className="flex justify-between items-center border-b border-dashboard-border pb-2">
                                                            <span className="font-black text-white text-xs">Jornada #{day.dayIndex}</span>
                                                            <span className="text-[10px] bg-blue-500/10 text-blue-300 font-bold px-2 py-0.5 rounded">
                                                               Silos: {day.targetSilos.join(', ')}
                                                            </span>
                                                         </div>
                                                         <div className="text-xs text-gray-400 space-y-1 py-1">
                                                            {day.blocks.map((b: any, idx: number) => (
                                                               <div key={idx} className="flex justify-between text-[11px]">
                                                                  <span className="text-coffee-light truncate max-w-[130px]">{b.profileName} ({b.format})</span>
                                                                  <span className="font-mono text-white font-bold">{b.targetKg} kg</span>
                                                               </div>
                                                            ))}
                                                         </div>
                                                         <div className="flex justify-between items-center pt-2 border-t border-dashboard-border">
                                                            <span className="text-xs font-mono font-bold text-white">Total: {day.totalKg} kg</span>
                                                            <button
                                                               onClick={() => generateSingleDayPlanReport(day, masterProfiles)}
                                                               className="text-[10px] bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white px-2.5 py-1 rounded font-bold uppercase transition-all flex items-center"
                                                            >
                                                               <FileText className="w-3 h-3 mr-1" /> Ficha PDF
                                                            </button>
                                                         </div>
                                                      </div>
                                                   ))}
                                                </div>
                                             </div>
                                          )}
                                       </div>
                                    );
                                 })}
                              </div>
                           )}
                        </div>
                     </div>
                  ) : (
                     /* VISTA: PLANIFICADOR ACTIVO */
                     <>
                  {/* KPI Summary Banner */}
                  {(() => {
                     const totalGross = demands.filter(d => d.status !== 'COMPLETED' && d.status !== 'REVIEWED').reduce((acc, d) => acc + d.kgRequested, 0);
                     const totalSurplus = surplusList.reduce((acc, s) => acc + s.totalKg, 0);
                     const totalNet = Math.max(0, Number((totalGross - totalSurplus).toFixed(1)));

                     return (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                           <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-5 shadow-lg flex items-center justify-between">
                              <div>
                                 <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-1">Demanda Bruta Total</span>
                                 <span className="text-2xl font-black text-white font-mono">{totalGross.toLocaleString()} <span className="text-xs text-gray-500 font-medium">kg</span></span>
                              </div>
                              <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl">
                                 <Package className="w-6 h-6" />
                              </div>
                           </div>

                           <div className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-5 shadow-lg flex items-center justify-between">
                              <div>
                                 <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest block mb-1">Stock Ya Fabricado (Sobrante)</span>
                                 <span className="text-2xl font-black text-green-400 font-mono">-{totalSurplus.toLocaleString()} <span className="text-xs text-gray-500 font-medium">kg</span></span>
                              </div>
                              <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl">
                                 <Boxes className="w-6 h-6" />
                              </div>
                           </div>

                           <div className="bg-dashboard-panel border border-coffee-accent/40 rounded-2xl p-5 shadow-lg flex items-center justify-between bg-gradient-to-r from-[#1e222b] to-[#25201a]">
                              <div>
                                 <span className="text-[10px] text-coffee-light font-black uppercase tracking-widest block mb-1">Demanda Neta a Tostar</span>
                                 <span className="text-2xl font-black text-coffee-light font-mono">{totalNet.toLocaleString()} <span className="text-xs text-coffee-light/60 font-medium">kg</span></span>
                              </div>
                              <div className="p-3 bg-coffee-accent/20 border border-coffee-accent/30 text-coffee-light rounded-xl">
                                 <Flame className="w-6 h-6" />
                              </div>
                           </div>
                        </div>
                     );
                  })()}

                  {/* NUEVA SECCIÓN: SOBRANTES DE STOCK / YA FABRICADO */}
                  <div className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-8 shadow-2xl space-y-6">
                     <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-dashboard-border pb-4 gap-4">
                        <div>
                           <h2 className="text-xl font-black text-white uppercase tracking-wider flex items-center">
                              <Boxes className="w-6 h-6 mr-3 text-green-400" /> Sobrantes de Stock / Ya Fabricado (Control Mensual)
                           </h2>
                           <p className="text-gray-400 text-xs mt-1">
                              Registra las cajas y paquetes ya fabricados al inicio de mes para que el motor de tueste los descuente de la orden de producción.
                           </p>
                        </div>
                        <div className="flex items-center space-x-2 bg-[#14161a] border border-dashboard-border px-3 py-1.5 rounded-xl">
                           <Calendar className="w-4 h-4 text-coffee-light" />
                           <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mes:</span>
                           <input 
                              type="text" 
                              value={selectedMonth} 
                              onChange={e => setSelectedMonth(e.target.value)}
                              className="bg-transparent text-xs font-black text-white focus:outline-none w-36 border-b border-transparent focus:border-coffee-light"
                              placeholder="Ej: Septiembre 2026"
                           />
                        </div>
                     </div>

                     {/* Tabla de sobrantes guardados */}
                     <div className="overflow-x-auto w-full border border-dashboard-border rounded-xl">
                        <table className="w-full text-left text-sm text-gray-400">
                           <thead className="bg-[#14161a] text-xs uppercase text-gray-500 font-black tracking-widest border-b border-dashboard-border">
                              <tr>
                                 <th className="px-6 py-3 text-left text-[10px] font-black text-green-400 uppercase tracking-widest">Gama/Perfil</th>
                                 <th className="px-6 py-3 text-left text-[10px] font-black text-green-400 uppercase tracking-widest">Formato</th>
                                 <th className="px-6 py-3 text-center text-[10px] font-black text-green-400 uppercase tracking-widest">Cajas</th>
                                 <th className="px-6 py-3 text-center text-[10px] font-black text-green-400 uppercase tracking-widest">Paquetes Sueltos</th>
                                 <th className="px-6 py-3 text-left text-[10px] font-black text-green-400 uppercase tracking-widest">Total Ya Fabricado</th>
                                 <th className="px-6 py-3 text-center text-[10px] font-black text-green-400 uppercase tracking-widest">Acción</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-dashboard-border/50">
                              {surplusList.length === 0 ? (
                                 <tr>
                                    <td colSpan={6} className="px-6 py-6 text-center text-xs text-gray-500">
                                       No hay sobrantes registrados para {selectedMonth}. Toda la previsión se tostará desde cero.
                                    </td>
                                 </tr>
                              ) : (
                                 surplusList.map((s) => (
                                    <tr key={s.id} className="hover:bg-white/5 transition-colors">
                                       <td className="px-6 py-4 font-black text-white">{s.profileName}</td>
                                       <td className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">{s.format}</td>
                                       <td className="px-6 py-4 text-center font-mono font-bold text-white">{s.boxes} cjs <span className="text-[9px] text-gray-500">({getUnitsPerBox(s.format)} ud/cj)</span></td>
                                       <td className="px-6 py-4 text-center font-mono font-bold text-gray-300">{s.packages} uds</td>
                                       <td className="px-6 py-4 font-mono font-bold text-green-400">{s.totalKg} kg</td>
                                       <td className="px-6 py-4 text-center">
                                          <button 
                                             onClick={() => handleRemoveSurplus(s.id)}
                                             className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                             title="Eliminar sobrante"
                                          >
                                             <Trash2 className="w-4 h-4" />
                                          </button>
                                       </td>
                                    </tr>
                                 ))
                              )}
                           </tbody>
                        </table>
                     </div>

                     {/* Formulario para añadir sobrante */}
                     <form onSubmit={handleAddSurplus} className="bg-[#14161a] p-5 rounded-xl border border-dashboard-border flex flex-col lg:flex-row items-end gap-4 shadow-inner">
                        <div className="flex-1 w-full">
                           <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Perfil / Gama</label>
                           <select 
                              required 
                              value={newSurplus.profileName} 
                              onChange={e => {
                                 const pName = e.target.value;
                                 let detectedFmt = newSurplus.format;
                                 const lower = pName.toLowerCase();
                                 if (lower.includes('250')) detectedFmt = '250g';
                                 else if (lower.includes('500')) detectedFmt = '500g';
                                 else if (lower.includes('450')) detectedFmt = '450g';
                                 else if (lower.includes('1 kg') || lower.includes('1000')) detectedFmt = '1000g';
                                 setNewSurplus(prev => ({ ...prev, profileName: pName, format: detectedFmt }));
                              }}
                              className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-400 font-bold text-xs"
                           >
                              <option value="" disabled>-- Selecciona Perfil --</option>
                              {masterProfiles.map(p => <option key={p?.name} value={p?.name}>{p?.name}</option>)}
                           </select>
                        </div>

                        <div className="w-full lg:w-36">
                           <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Formato</label>
                           <select 
                              value={newSurplus.format} 
                              onChange={e => setNewSurplus(prev => ({ ...prev, format: e.target.value }))}
                              className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg px-3 py-3 text-white focus:outline-none focus:border-green-400 font-bold text-xs"
                           >
                              <option value="1000g">1 kg (1000g)</option>
                              <option value="500g">500 g</option>
                              <option value="450g">450 g</option>
                              <option value="250g">250 g</option>
                              <option value="2KG">2 kg</option>
                           </select>
                        </div>

                        <div className="w-full lg:w-28">
                           <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                              Cajas <span className="text-[8px] text-gray-400">({getUnitsPerBox(newSurplus.format)} ud)</span>
                           </label>
                           <input 
                              type="number" 
                              min="0" 
                              step="1"
                              value={newSurplus.boxes || ''}
                              placeholder="0"
                              onChange={e => setNewSurplus(prev => ({ ...prev, boxes: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg px-3 py-3 text-white font-mono text-center focus:outline-none focus:border-green-400 text-xs font-bold"
                           />
                        </div>

                        <div className="w-full lg:w-28">
                           <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Pqs Sueltos</label>
                           <input 
                              type="number" 
                              min="0" 
                              step="1"
                              value={newSurplus.packages || ''}
                              placeholder="0"
                              onChange={e => setNewSurplus(prev => ({ ...prev, packages: Math.max(0, parseInt(e.target.value) || 0) }))}
                              className="w-full bg-[#1e222b] border border-dashboard-border rounded-lg px-3 py-3 text-white font-mono text-center focus:outline-none focus:border-green-400 text-xs font-bold"
                           />
                        </div>

                        <div className="w-full lg:w-36 px-2 py-3 bg-[#1e222b] border border-dashboard-border rounded-lg text-center">
                           <span className="text-[9px] text-gray-500 uppercase font-black tracking-widest block">Total Kg</span>
                           <span className="text-sm font-black text-green-400 font-mono">
                              {calculateSurplusKg(newSurplus.format, newSurplus.boxes, newSurplus.packages)} kg
                           </span>
                        </div>

                        <button 
                           type="submit" 
                           className="w-full lg:w-auto px-5 py-3 bg-green-600 hover:bg-green-500 text-white font-black tracking-widest uppercase rounded-lg shadow-md transition-all text-xs flex items-center justify-center shrink-0"
                        >
                           <Plus className="w-4 h-4 mr-1" /> Guardar Sobrante
                        </button>
                     </form>
                  </div>

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
                                 <th className="px-6 py-3 text-left text-[10px] font-black text-coffee-accent uppercase tracking-widest">Delegación</th>
                                 <th className="px-6 py-3 text-left text-[10px] font-black text-coffee-accent uppercase tracking-widest">Gama/Perfil</th>
                                 <th className="px-6 py-3 text-left text-[10px] font-black text-coffee-accent uppercase tracking-widest">Formato</th>
                                 <th className="px-6 py-3 text-left text-[10px] font-black text-coffee-accent uppercase tracking-widest text-center">Estado</th>
                                 <th className="px-6 py-3 text-left text-[10px] font-black text-coffee-accent uppercase tracking-widest">Demanda (Kg)</th>
                                 <th className="px-6 py-3 text-center text-[10px] font-black text-coffee-accent uppercase tracking-widest">Acción</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-dashboard-border/50">
                              {demands.map((d) => (
                                 <tr key={d.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4">
                                       <span className="bg-coffee-accent/10 px-2 py-1 rounded text-[10px] font-bold text-coffee-light border border-coffee-accent/20 uppercase tracking-widest">{d.delegation}</span>
                                    </td>
                                    <td className="px-6 py-4 font-black text-white">{d.profileName}</td>
                                    <td className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">{d.format}</td>
                                    <td className="px-6 py-4 text-center">
                                       {d.status === 'COMPLETED' ? (
                                          <div className="flex flex-col items-center">
                                             <span className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-green-500/30 animate-pulse">
                                                Terminado: revisar
                                             </span>
                                          </div>
                                       ) : d.status === 'PRODUCING' ? (
                                          <span className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-blue-500/20">
                                             En Producción
                                          </span>
                                       ) : (
                                          <span className="text-gray-600 text-[9px] font-black uppercase tracking-widest">Pendiente</span>
                                       )}
                                    </td>
                                    <td className="px-6 py-4 font-mono font-bold text-white">{d.kgRequested} kg</td>
                                    <td className="px-6 py-4 text-center">
                                       <button 
                                          onClick={() => handleRemoveDemand(d.id)}
                                          className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                          title={d.status === 'COMPLETED' ? "Quitar de la lista" : "Borrar petición"}
                                       >
                                          {d.status === 'COMPLETED' ? <CheckCircle className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
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
                              {masterProfiles.map(p => <option key={p?.name} value={p?.name}>{p?.name}</option>)}
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
                        Arrancar Planificador
                     </button>
                  </div>

                  {/* Planned Days Output Grid */}
                  {plannedDays.length > 0 && (() => {
                     // Compute Green Coffee Procurement Summary directly from masterProfiles
                     let totalGreenKg = 0;
                     const greenByOrigin: { [origin: string]: { kg: number, sacks: number, sackWeight: number } } = {};

                     plannedDays.forEach(day => {
                        day.siloAssignments.forEach(silo => {
                           silo.batches.forEach(batch => {
                              const sackWeight = getOriginSackWeight(silo.origin, batch.profileName, masterProfiles);
                              const batchGreen = sackWeight * 2;
                              totalGreenKg += batchGreen;
                              const originClean = silo.origin.trim();
                              if (!greenByOrigin[originClean]) {
                                 greenByOrigin[originClean] = { kg: 0, sacks: 0, sackWeight };
                              }
                              greenByOrigin[originClean].kg += batchGreen;
                              greenByOrigin[originClean].sacks += 2;
                              greenByOrigin[originClean].sackWeight = sackWeight;
                           });
                        });
                     });

                     const totalSacks = Object.values(greenByOrigin).reduce((acc, v) => acc + v.sacks, 0);

                     return (
                        <div className="space-y-6 mt-8">
                           {/* Tarjeta de Aprovisionamiento Global de Café Verde */}
                           <div className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-6 shadow-2xl space-y-4">
                              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-dashboard-border pb-4 gap-3">
                                 <div>
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center">
                                       <Boxes className="w-5 h-5 mr-2 text-yellow-500" /> Aprovisionamiento de Café Verde (Necesidades del Mes)
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                       Cálculo global de sacos y kg que se deben retirar de almacén o comprar para cumplir la planificación de {selectedMonth}.
                                    </p>
                                 </div>
                                 <div className="text-right">
                                    <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest block">Total Verde</span>
                                    <span className="text-xl font-black text-yellow-500 font-mono">
                                       {totalGreenKg.toLocaleString()} kg <span className="text-xs text-gray-400 font-normal">({totalSacks} sacos)</span>
                                    </span>
                                 </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                 {Object.entries(greenByOrigin).map(([origin, val]) => (
                                    <div key={origin} className="bg-[#14161a] border border-dashboard-border p-3 rounded-xl flex justify-between items-center">
                                       <div>
                                          <span className="text-xs font-black text-white block truncate">{origin}</span>
                                          <span className="text-[11px] text-gray-400 font-mono">{val.sacks} sacos <span className="text-yellow-400/90 font-bold">({val.sackWeight} kg/saco)</span></span>
                                       </div>
                                       <span className="text-sm font-black text-coffee-light font-mono">{val.kg.toLocaleString()} kg</span>
                                    </div>
                                 ))}
                              </div>
                           </div>

                           {/* Fichas de Jornadas Planificadas */}
                           <div className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-8 shadow-2xl">
                              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-dashboard-border pb-4 mb-6 gap-4">
                                 <div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-wider flex items-center">
                                       <ClipboardList className="w-5 h-5 mr-3 text-blue-400" /> Planificación Generada ({plannedDays.length} Jornadas)
                                    </h3>
                                    <p className="text-xs text-gray-400 mt-1">
                                       Descarga las hojas de trabajo en PDF para operar directamente en fábrica a mano.
                                    </p>
                                 </div>
                                 <div className="flex items-center space-x-3">
                                    <button 
                                       onClick={() => setShowValidateModal(true)}
                                       className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center shadow-lg transition-all active:scale-95 border border-green-400/30"
                                       title="Validar y archivar en el histórico mensual"
                                    >
                                       <CheckCircle2 className="w-4 h-4 mr-2" /> Validar Planificación
                                    </button>
                                    <button 
                                       onClick={() => generateRoastingPlanReport(plannedDays, masterProfiles, selectedMonth)}
                                       className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest flex items-center shadow-lg transition-all active:scale-95"
                                    >
                                       <FileText className="w-4 h-4 mr-2" /> Exportar Plan Completo PDF
                                    </button>
                                 </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                 {plannedDays.map(day => {
                                    // Day green total directly from masterProfiles
                                    let dayGreenKg = 0;
                                    let daySacks = 0;
                                    day.siloAssignments.forEach(silo => {
                                       silo.batches.forEach(b => {
                                          const sw = getOriginSackWeight(silo.origin, b.profileName, masterProfiles);
                                          dayGreenKg += sw * 2;
                                          daySacks += 2;
                                       });
                                    });

                                    return (
                                       <div key={day.dayIndex} className="bg-[#14161a] border border-dashboard-border rounded-2xl overflow-hidden flex flex-col group hover:border-blue-500/50 transition-colors shadow-lg">
                                          {/* Card Header */}
                                          <div className="bg-gradient-to-r from-blue-900/30 to-[#14161a] p-3.5 border-b border-dashboard-border flex justify-between items-center">
                                             <div className="flex items-center space-x-1.5">
                                                <span className="font-black text-white text-xs tracking-widest uppercase">Día #{day.dayIndex}</span>
                                                <input type="date" 
                                                       value={day.scheduledDate || ''}
                                                       onChange={(e) => {
                                                          const ns = [...plannedDays];
                                                          const tgt = ns.find(x => x.dayIndex === day.dayIndex);
                                                          if (tgt) tgt.scheduledDate = e.target.value;
                                                          setPlannedDays(ns);
                                                       }}
                                                       className="bg-[#1e222b] border border-dashboard-border text-white px-1.5 py-0.5 rounded text-[11px] focus:border-blue-500 outline-none w-28" />
                                             </div>
                                             
                                             <div className="flex items-center space-x-1">
                                                {/* Day controls */}
                                                <button 
                                                   onClick={() => handleMoveDay(day.dayIndex, 'UP')} 
                                                   disabled={day.dayIndex === 1}
                                                   title="Mover día hacia arriba"
                                                   className="p-1 text-gray-500 hover:text-white disabled:opacity-20 disabled:hover:text-gray-500 rounded"
                                                >
                                                   <ArrowUp className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                   onClick={() => handleMoveDay(day.dayIndex, 'DOWN')} 
                                                   disabled={day.dayIndex === plannedDays.length}
                                                   title="Mover día hacia abajo"
                                                   className="p-1 text-gray-500 hover:text-white disabled:opacity-20 disabled:hover:text-gray-500 rounded"
                                                >
                                                   <ArrowDown className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                   onClick={() => handleDeleteDay(day.dayIndex)} 
                                                   title="Eliminar día"
                                                   className="p-1 text-gray-500 hover:text-red-400 rounded"
                                                >
                                                   <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                             </div>
                                          </div>

                                          {/* Sub-header badge */}
                                          <div className="px-4 py-2 bg-[#171a20] border-b border-dashboard-border/40 flex justify-between items-center text-[10px]">
                                             <span className="bg-blue-500/10 text-blue-300 font-bold px-2 py-0.5 rounded border border-blue-500/20">
                                                Silos: {day.targetSilos.join(', ')}
                                             </span>
                                             <span className="text-gray-400 font-mono">
                                                Verde: <span className="text-white font-bold">{dayGreenKg} kg</span> ({daySacks} sc)
                                             </span>
                                          </div>

                                          {/* Blocks */}
                                          <div className="p-4 space-y-2 flex-1 max-h-56 overflow-y-auto">
                                             {day.blocks.map((b, i) => (
                                                <div key={i} className="flex justify-between items-center bg-[#1e222b] p-2 rounded-lg border border-dashboard-border">
                                                   <div>
                                                      <div className="text-xs font-bold text-coffee-light truncate max-w-[130px]">{b.profileName}</div>
                                                      <div className="text-[9px] text-gray-500 font-mono">FMT: {b.format}</div>
                                                   </div>
                                                   <div className="text-xs font-black text-white">{b.targetKg}kg</div>
                                                </div>
                                             ))}
                                          </div>

                                          {/* Card Footer */}
                                          <div className="p-3.5 bg-dashboard-bg border-t border-dashboard-border flex flex-col space-y-2">
                                             <div className="flex justify-between items-center text-xs">
                                                <span className="text-gray-400 font-mono text-[11px]">Tostado Objetivo:</span>
                                                <span className="text-white font-black">{day.totalKg} kg</span>
                                             </div>
                                             
                                             <div className="flex space-x-2 pt-1">
                                                <button 
                                                   onClick={() => generateSingleDayPlanReport(day, masterProfiles)}
                                                   title="Descargar Ficha de Planta (PDF)"
                                                   className="flex-1 py-2 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider border border-blue-500/20 flex items-center justify-center transition-all"
                                                >
                                                   <FileText className="w-3 h-3 mr-1" /> Ficha PDF
                                                </button>
                                                <button 
                                                   onClick={() => handleLaunchDay(day)} 
                                                   className="py-2 px-3 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-colors border border-gray-700"
                                                   title="Enviar a agenda digital"
                                                >
                                                   Lanzar
                                                </button>
                                             </div>
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           </div>
                        </div>
                     );
                  })()}
                     </>
                  )}

                  {/* MODAL DE CONFIRMACIÓN PARA VALIDAR PLANIFICACIÓN */}
                  {showValidateModal && (() => {
                     const totalRoastedKg = Number(plannedDays.reduce((acc, d) => acc + d.totalKg, 0).toFixed(1));
                     let totalGreenKg = 0;
                     let totalSacks = 0;
                     plannedDays.forEach(day => {
                        day.siloAssignments.forEach(silo => {
                           silo.batches.forEach(b => {
                              const sw = getOriginSackWeight(silo.origin, b.profileName, masterProfiles);
                              totalGreenKg += sw * 2;
                              totalSacks += 2;
                           });
                        });
                     });

                     return (
                        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                           <div className="bg-[#14161a] border border-dashboard-border rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-6 animate-fadeIn">
                              <div className="flex items-center space-x-3 text-green-400">
                                 <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-2xl">
                                    <CheckCircle2 className="w-8 h-8" />
                                 </div>
                                 <div>
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">¿Validar Planificación Mensual?</h3>
                                    <span className="text-xs text-gray-400 font-mono">{selectedMonth}</span>
                                 </div>
                              </div>

                              <p className="text-xs text-gray-300 leading-relaxed">
                                 ¿Estás seguro de que deseas validar la planificación generada de <strong>{selectedMonth}</strong>?
                              </p>

                              <div className="bg-[#1e222b] border border-dashboard-border p-4 rounded-xl space-y-2 text-xs">
                                 <div className="flex justify-between text-gray-300">
                                    <span>Jornadas a Registrar:</span>
                                    <span className="font-bold text-white font-mono">{plannedDays.length} jornadas</span>
                                 </div>
                                 <div className="flex justify-between text-gray-300">
                                    <span>Café Tostado Neto:</span>
                                    <span className="font-bold text-coffee-light font-mono">{totalRoastedKg} kg</span>
                                 </div>
                                 <div className="flex justify-between text-gray-300">
                                    <span>Café Verde Requerido:</span>
                                    <span className="font-bold text-yellow-500 font-mono">{totalGreenKg} kg ({totalSacks} sacos)</span>
                                 </div>
                              </div>

                              <p className="text-[11px] text-gray-500 italic">
                                 Al confirmar, esta planificación pasará automáticamente al <strong>Histórico Mensual</strong> y los pedidos se marcarán como validados.
                              </p>

                              <div className="flex items-center justify-end space-x-3 pt-2">
                                 <button
                                    onClick={() => setShowValidateModal(false)}
                                    className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold uppercase transition-colors"
                                 >
                                    Cancelar
                                 </button>
                                 <button
                                    onClick={handleConfirmValidation}
                                    className="px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all active:scale-95"
                                 >
                                    Sí, Validar y Archivar
                                 </button>
                              </div>
                           </div>
                        </div>
                     );
                  })()}
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
                                          <option key={p?.name} value={p?.name}>{p?.name}</option>
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
                        <div className="flex justify-between items-center border-b border-dashboard-border pb-3">
                           <h2 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center">
                              <Target className="w-5 h-5 mr-3 text-gray-500" /> Planificación Activa ({roastOrders.length})
                           </h2>
                           {roastOrders.length > 0 && (
                              <button 
                                onClick={() => generateDailyProductionReport(roastOrders)}
                                className="bg-red-600/10 border border-red-500/30 text-red-500 px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest flex items-center hover:bg-red-600 hover:text-white transition-all shadow-md group"
                              >
                                <FileText className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" /> Exportar Informe PDF
                              </button>
                           )}
                        </div>

                        {roastOrders.length === 0 ? (
                           <div className="flex-1 border-2 border-dashed border-dashboard-border rounded-3xl flex flex-col items-center justify-center text-gray-500 p-10 min-h-[300px]">
                              <Package className="w-12 h-12 mb-4 opacity-50" />
                              <p className="font-bold uppercase tracking-widest text-sm text-center">No hay órdenes planificadas.</p>
                              <p className="text-xs mt-2 text-center">Todas las órdenes generadas aparecerán aquí desglosadas por tarea.</p>
                           </div>
                        ) : (
                           <div className="space-y-4">
                              {roastOrders.map((order, oIdx) => (
                                 <div key={`${order?.id}-${oIdx}`} className="bg-dashboard-panel border border-dashboard-border rounded-2xl p-6 shadow-xl relative overflow-hidden transition-all hover:border-coffee-light/30">
                                    {order.priority === 'URGENTE' && <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/10 rounded-full blur-2xl pointer-events-none"></div>}

                                    <div className="flex justify-between items-start mb-4">
                                       <div className="flex flex-col">
                                          <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-1 flex items-center">
                                             Orden {order?.id}
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
                                             <h3 className="text-lg font-black text-white">
                                                {order.id.startsWith('PLAN-') && order.tasks.length > 0 
                                                   ? `Plan D${order.id.split('-').pop()?.replace('D','')}: ` + [...new Set(order.tasks.map(t => t.masterProfile?.name).filter(Boolean))].join(' & ') 
                                                   : order.profileName} 
                                                <span className="text-coffee-light font-mono ml-2 border-l border-white/20 pl-2">{order.totalKg}kg previstos</span>
                                             </h3>
                                             {order.status === 'PLANNED' && viewMode === 'MANAGER' && (
                                                <button 
                                                   onClick={() => handleDeleteOrder(order?.id)}
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
                                                   Sugerencia: Tostar Tras {order?.id.slice(-1)} {parseInt(order?.id.slice(-1)) % 2 === 0 ? '(Inercia Alta)' : '(Inercia Baja)'}
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
                                                ? matchingSilos.map(s => `Silo ${s?.id} (${s.currentKg}kg ext)`).join(', ')
                                                : '⚠️ SIN ASIGNACIÓN DE SILO';

                                             return (
                                                <div key={`${task?.id}-${idx}`} className="flex flex-col bg-[#1e222b] px-4 py-2 rounded-lg border border-dashboard-border/50 text-sm overflow-hidden">
                                                   <div className="flex items-center justify-between">
                                                      <div className="flex items-center space-x-3 w-1/2">
                                                         <div className="w-6 h-6 rounded-full bg-dashboard-bg flex items-center justify-center text-[10px] font-black text-gray-500 border border-dashboard-border">
                                                            {idx + 1}
                                                         </div>
                                                         <div className="flex flex-col">
                                                            <span className="font-bold text-gray-300 truncate">
                                                               {task.type === 'ROAST' ? `Tostada ${task.batchIndex}/${task.totalBatches} (${order.profileName})` : task.origins.join(' + ')}
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
                                                            onClick={() => alert(`🖨️ Imprimiendo Etiqueta para SILO-${task?.id.slice(-4)}\nComponente: ${task.origins[0]}\nESTADO: ESPERANDO MEZCLA`)}
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
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter">
                           {viewMode === 'PACKAGING' ? 'Ejecución de Planta (Ensamblaje)' : 'Planta (Operario)'}
                        </h2>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">
                            {viewMode === 'PACKAGING' ? 'Cola de Envasado & Reposo Operativa' : 'Cola de Tostado Activa'}
                         </p>
                      </div>
                      <div className="flex items-center space-x-4">
                         {roastOrders.length > 0 && (
                            <>
                               <button 
                                 onClick={() => generatePalletShippingReport(roastOrders, demands)}
                                 className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg active:scale-95 flex items-center space-x-2"
                               >
                                 <Package className="w-4 h-4" />
                                 <span>Imprimir Hoja Paletizado</span>
                               </button>
                               <button 
                                 onClick={() => generateDailyProductionReport(roastOrders)}
                                 className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg active:scale-95 flex items-center space-x-2"
                               >
                                 <FileText className="w-4 h-4" />
                                 <span>Exportar Informe de Producción PDF</span>
                               </button>
                            </>
                         )}
                         {viewMode === 'PACKAGING' && (
                            <button
                               onClick={() => generatePackagingOrderReport(roastOrders, demands)}
                               className="flex items-center space-x-2 bg-coffee-accent hover:bg-coffee-accent/90 text-white px-4 py-2 rounded-xl font-bold transition-all shadow-lg active:scale-95"
                            >
                               <FileText className="w-4 h-4" />
                               <span>Imprimir Orden Envasado</span>
                            </button>
                         )}
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
                        const machine = ROASTING_MACHINES.find(m => m?.id === task.machineId);
                        
                        // Segregate displays strictly:
                        // 'OPERATOR' shows only 'ROAST' tasks.
                        // 'PACKAGING' ('Ejecución de Planta') shows only 'BLEND' tasks.
                        if (viewMode === 'OPERATOR' && task.type !== 'ROAST') return null;
                        if (viewMode === 'PACKAGING' && task.type !== 'BLEND') return null;

                         // Special UI render for BLEND task (Ejecución de Planta)
                         if (task.type === 'BLEND') {
                            return (
                               <div key={`${task?.id}-${idx}`} className="bg-dashboard-panel border-2 border-green-500/30 rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col group hover:border-green-500/50 transition-all">
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
                                           const assignedSiloObj = silos.find(s => s?.id === sId);
                                           return (
                                              <div key={sIdx} className="flex justify-between items-center bg-[#1e222b] p-2 rounded-lg border border-dashboard-border/50">
                                                 <div className="flex items-center space-x-2">
                                                    <Database className="w-3 h-3 text-green-500" />
                                                    <span className="text-xs text-white font-bold">Silo {assignedSiloObj?.id || sId}</span>
                                                 </div>
                                                 <span className="text-[10px] text-gray-400 truncate w-24">({roastOrders.find(o => o.id === task.parentOrderId)?.tasks.find(t => t.type === 'ROAST' && t.assignedSilos?.includes(sId))?.origins?.[0] || assignedSiloObj?.profileName || 'Origen'})</span>
                                              </div>
                                           );
                                        })}
                                     </div>
                                  </div>

                                  <button
                                     onClick={() => {
                                        setActivePackagingTask(task);
                                     }}
                                     className="w-full py-4 rounded-xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center space-x-3 bg-green-600/20 border border-green-500 hover:bg-green-600 text-white shadow-lg active:scale-95"
                                  >
                                     <CheckCircle className="w-5 h-5" />
                                     <span>CONFIRMAR EN REPOSO Y ENVASAR</span>
                                  </button>
                               </div>
                            );
                         }

                         return (
                            <div key={`${task?.id}-${idx}`} className="bg-dashboard-panel border border-dashboard-border rounded-3xl p-6 shadow-xl relative overflow-hidden flex flex-col group hover:border-blue-500/50 transition-all">
                               <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                               
                               <div className="flex justify-between items-start mb-6">
                                  <div className="bg-[#14161a] px-3 py-1 rounded-lg border border-dashboard-border">
                                     <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">#{task.batchIndex || (idx + 1)} Tarea</span>
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
                                     const assignedSiloObj = silos.find(s => s?.id === sId);
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

         {/* Packaging Overlay Injection */}
         {activePackagingTask && (
            <PackagingOverlay 
               task={activePackagingTask}
               onClose={() => setActivePackagingTask(null)}
               silos={silos}
               setSilos={setSilos}
               roastOrders={roastOrders}
               onSuccess={() => {
                  setRoastOrders(prev => prev.map(o => {
                     if (o.id === activePackagingTask.parentOrderId) {
                        return { 
                           ...o, 
                           tasks: o.tasks.map(t => {
                              // Only update current task and its specific origin components
                              if (t.id === activePackagingTask.id) return { ...t, status: 'ROASTED' };
                              if (t.type === 'ROAST' && (t.masterProfile?.name === activePackagingTask.masterProfile?.name)) {
                                 return { ...t, status: 'ROASTED' };
                              }
                              return t;
                           })
                        };
                     }
                     return o;
                  }));
               }}
            />
         )}
      </div>
   );
};

export default DailyRoastOrders;