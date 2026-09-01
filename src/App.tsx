import React, { useState, useEffect } from 'react';
import LiveRoastControl from './components/LiveRoastControl';
import QualityLab from './components/QualityLab';
import ManagementDashboard from './components/ManagementDashboard';
import MasterProfiles from './components/MasterProfiles';
import TraceabilityDetective from './components/TraceabilityDetective';
import DailyRoastOrders from './components/DailyRoastOrders';
import ManualRoastControl from './components/ManualRoastControl';
import SiloManager from './components/SiloManager';
import { Database, LayoutDashboard, Target, TestTube2, Flame, CheckCircle, Lock, FileSearch, Timer, Package, Cpu, ChevronDown } from 'lucide-react';
import { fetchSilos, fetchMasterProfiles, fetchDailyOrders, updateTaskStatus, updateSilo, updateTaskId } from './lib/api';

export interface MachineSpecificProfile {
  targetAgtron: number;
  ghostCurve: { time: number, temp: number }[];
}

// Fallback Error Boundary
class ErrorBoundary extends React.Component<{children: any}, {hasError: boolean, error: any}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 bg-red-900 text-white min-h-screen">
           <h1 className="text-3xl font-black mb-4">SYSTEM CRASH</h1>
           <pre className="p-4 bg-black rounded whitespace-pre-wrap">{this.state.error?.stack || this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export interface MasterProfile {
  name: string;
  agtron: number;
  roastedType: string;
  businessUnit: 'LIDL' | 'PROPIA';
  roastStrategy: 'PRE_BLEND' | 'POST_BLEND';
  expectedShrinkage?: number;
  blend: { origin: string, percentage: number, sackWeight?: number }[];
  sensory: {
    fragrancia: number;
    aroma: number;
    sabor: number;
    cuerpo: number;
  };
  machineProfiles?: { [machineId: string]: MachineSpecificProfile };
}

export interface RoastingMachine {
  id: string;
  name: string;
  maxCapacity: number;
  bbpCooldownBase: number;
  bbpCoefficient: number;
  energyType: 'GAS' | 'ELECTRIC';
}


export type LotStatus = 'definicion' | 'tueste' | 'laboratorio' | 'validado';

export type OrderCategory = 'MDD' | 'MARCA_PROPIA';

export type Silo = {
  id: number;
  profileName: string | null;
  currentKg: number;
  maxKg: number;
  lastFillDate?: string | null;
};

export interface ActiveLot {
  id: string;
  profile: MasterProfile;
  status: LotStatus;
  machineId?: string;
  batchWeight?: number; 
  roastData?: { 
    finalTemp: number, 
    finalRor: number, 
    devTime: number,
    chargeTemp?: number,
    turnaroundTemp?: number,
    turnaroundTime?: string,
    firstCrackTemp?: number,
    firstCrackTime?: string
  };
  batchIndex?: number;    
  totalBatches?: number;  
  orderTotalKg?: number;
  parentOrderId?: string;
  origins?: string[];
  assignedSilos?: number[];
  consumedLots?: { lotId: string, weightKg: number, origin: string }[];
  category?: OrderCategory; // Phase 12
  type: 'ROAST' | 'BLEND';
}

export interface ConsumedLot {
  lotId: string;
  weightKg: number;
  costPerKg: number;
}

export interface RoastTask {
  id: string; // TSK-XXXX
  parentOrderId: string;
  type: 'ROAST' | 'BLEND';
  masterProfile: MasterProfile;
  machineId?: string; // Assigned at fragmentation
  origins: string[]; // Supports multiple origins for PRE_BLEND or single for POST_BLEND
  targetWeightKg: number;
  actualWeightKg?: number;
  status: 'PENDING' | 'ROASTED' | 'RESTING' | 'LAB_REJECTED' | 'COMPLETED' | 'ARCHIVED';
  consumedLots?: ConsumedLot[]; // Multi-Lot tracking for FIFO Engine
  assignedSilos?: number[]; // Phase 11: Linked source silos
  batchIndex?: number;
  totalBatches?: number;
  parentOrderTotalKg?: number;
  category?: OrderCategory; // Phase 12
  roastedAt?: number;
  roastData?: {
    finalTemp: number,
    finalTime?: string,
    finalRor: number,
    devTime: number,
    chargeTemp?: number,
    chargeTime?: string,
    turnaroundTemp?: number,
    turnaroundTime?: string,
    yellowTemp?: number,
    yellowTime?: string,
    maillardTemp?: number,
    maillardTime?: string,
    firstCrackTemp?: number,
    firstCrackTime?: string
  };
  fulfilledDemandIds?: string[];
  lotNumber?: string;
}

export interface DailyRoastOrder {
  id: string; // ORD-XXXX
  profileName: string;
  totalKg: number;
  priority: 'URGENTE' | 'STOCK' | 'MUESTRA';
  shrinkagePct: number;
  tasks: RoastTask[];
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
  estimatedPmpCost?: number; // PMP Average Price calculated at formulation
  category: OrderCategory; // Phase 12
}

export const ROASTING_MACHINES: RoastingMachine[] = [
  { id: 'TOST-A', name: 'Tostadora Única', maxCapacity: 120, bbpCooldownBase: 180, bbpCoefficient: 0.5, energyType: 'ELECTRIC' }
];

function App() {
  const [activeTab, setActiveTab] = useState<'orders' | 'profiles' | 'mgmt' | 'roast' | 'manual_roast' | 'lab' | 'traceability' | 'silos' | 'planning' | 'packaging'>('planning');
  const [showSecondaryModules, setShowSecondaryModules] = useState(false);
  const [activeLot, setActiveLot] = useState<ActiveLot | null>(null);

  const [masterProfiles, setMasterProfiles] = useState<MasterProfile[]>([]);
  const [roastOrders, setRoastOrders] = useState<DailyRoastOrder[]>([]);
  const [silos, setSilos] = useState<Silo[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  // Persistence State for Manual Roast (to prevent loss on tab switch)
  const [roastSession, setRoastSession] = useState<{
    isRunning: boolean,
    elapsedTime: number,
    dataPoints: any[],
    finalWeight: string,
    targetSiloId: number,
    checklist: any,
    showFinalReport: boolean,
    showBlendingOverlay: boolean,
    agtronColor: string,
    roastCount: number,
    chargeTempInput: string,
    currentRoR: number,
    consistencyScore: number,
    finalMixWeight: string,
    showSamplePrompt: boolean,
    currentTemp: string,
    showMilestoneModal: boolean,
    pendingMilestone: any | null
  }>({
    isRunning: false,
    elapsedTime: 0,
    dataPoints: [],
    finalWeight: "",
    targetSiloId: 0,
    checklist: { silo: false, coffee: false, temp: false, discharge: false },
    showFinalReport: false,
    showBlendingOverlay: false,
    agtronColor: "",
    roastCount: 0,
    chargeTempInput: "150",
    currentRoR: 0,
    consistencyScore: 0,
    finalMixWeight: "",
    showSamplePrompt: false,
    currentTemp: "",
    showMilestoneModal: false,
    pendingMilestone: null
  });

  // Phase 18: Hydrate Initial State from Supabase
  useEffect(() => {
    const loadData = async () => {
      console.log("Fetching DB State from Supabase...");
      const [dbSilos, dbProfiles, dbOrders] = await Promise.all([
        fetchSilos(),
        fetchMasterProfiles(),
        fetchDailyOrders()
      ]);
      
      setSilos(dbSilos);
      setMasterProfiles(dbProfiles);
      setRoastOrders(dbOrders);
      setIsDbLoaded(true);

      // Auto-focus on Packaging if there's work left from yesterday
      const hasPendingPackaging = dbOrders.some(o => 
        o.tasks.some(t => t.type === 'BLEND' && t.status === 'PENDING')
      );
      if (hasPendingPackaging) {
        setActiveTab('packaging');
      }
    };
    loadData();
  }, []);

  // Centralized Roast Timer (to keep running when switching tabs)
  useEffect(() => {
    let interval: any;
    if (roastSession.isRunning) {
       interval = setInterval(() => {
          setRoastSession(prev => ({ ...prev, elapsedTime: prev.elapsedTime + 1 }));
       }, 1000);
    }
    return () => clearInterval(interval);
  }, [roastSession.isRunning]);

  if (!isDbLoaded) {
    return (
      <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center text-white">
        <div className="flex flex-col items-center animate-pulse">
           <Database className="w-12 h-12 text-blue-500 mb-4 animate-bounce" />
           <p className="font-bold tracking-widest uppercase text-sm text-gray-400">Sincronizando con Supabase...</p>
        </div>
      </div>
    );
  }

  const handleLaunchManualRoast = (task: RoastTask) => {
    setActiveLot({
      id: task?.id,
      profile: task.masterProfile,
      status: 'tueste',
      machineId: task.machineId,
      batchWeight: task.targetWeightKg,
      batchIndex: task.batchIndex,
      totalBatches: task.totalBatches,
      orderTotalKg: task.parentOrderTotalKg,
      parentOrderId: task.parentOrderId,
      origins: task.origins,
      assignedSilos: task.assignedSilos,
      category: task.category,
      type: task.type
    });
    setActiveTab('manual_roast');
  };

  const handleBatchComplete = async (metrics: { 
     actualWeight: number, 
     finalTemp?: number, 
     finalTime?: string,
     finalRor?: number, 
     devTime?: number,
     chargeTemp?: number,
     chargeTime?: string,
     turnaroundTemp?: number,
     turnaroundTime?: string,
     yellowTemp?: number,
     yellowTime?: string,
     maillardTemp?: number,
     maillardTime?: string,
     firstCrackTemp?: number,
     firstCrackTime?: string,
     agtronColor?: string
  }) => {
    const { actualWeight } = metrics;

    if (activeLot && activeLot.parentOrderId) {
      const roastedTimestamp = Date.now();
      
      const isSuccess = await updateTaskStatus(activeLot?.id, 'ROASTED', { 
        actualWeightKg: actualWeight, 
        roastedAt: roastedTimestamp,
        roastData: {
            finalTemp: metrics.finalTemp || 0,
            finalTime: metrics.finalTime || '--',
            finalRor: metrics.finalRor || 0,
            devTime: metrics.devTime || 0,
            chargeTemp: metrics.chargeTemp,
            chargeTime: metrics.chargeTime,
            turnaroundTemp: metrics.turnaroundTemp,
            turnaroundTime: metrics.turnaroundTime,
            yellowTemp: metrics.yellowTemp,
            yellowTime: metrics.yellowTime,
            maillardTemp: metrics.maillardTemp,
            maillardTime: metrics.maillardTime,
            firstCrackTemp: metrics.firstCrackTemp,
            firstCrackTime: metrics.firstCrackTime,
            agtronColor: metrics.agtronColor
        }
      });

      if (!isSuccess) {
        alert("Error de red: No se pudo registrar el tueste en Supabase.");
        return;
      }

      setRoastSession({
        isRunning: false,
        elapsedTime: 0,
        dataPoints: [],
        finalWeight: "",
        targetSiloId: 0,
        checklist: { silo: false, coffee: false, temp: false, discharge: false },
        showFinalReport: false,
        showBlendingOverlay: false,
        agtronColor: "",
        roastCount: roastSession.roastCount + 1,
        chargeTempInput: "150",
        currentRoR: 0,
        consistencyScore: 0,
        finalMixWeight: "",
        showSamplePrompt: false,
        currentTemp: "",
        showMilestoneModal: false,
        pendingMilestone: null
      });

      // Auto-update Silo if assigned
      if (activeLot.assignedSilos && activeLot.assignedSilos.length > 0) {
          // If it's a ROAST task, we ADD to the first silo
          if (activeLot.type === 'ROAST') {
             const targetSiloId = activeLot.assignedSilos[0];
             const pickedSilo = silos.find(s => s?.id === targetSiloId);
             
             if (pickedSilo) {
                const siloDisplayName = activeLot.origins && activeLot.origins.length > 0 
                   ? `${activeLot.origins[0]} (${activeLot.profile?.name})` 
                   : activeLot.profile?.name || null;

                const newSiloKg = Math.max(0, pickedSilo.currentKg + actualWeight);
                const finalProfileName = newSiloKg <= 0.1 ? null : siloDisplayName;

                await updateSilo(targetSiloId, {
                   currentKg: newSiloKg,
                   profileName: finalProfileName,
                   lastFillDate: new Date().toISOString()
                });
                
                setSilos(prev => prev.map(s => s?.id === targetSiloId ? {
                   ...s,
                   currentKg: newSiloKg,
                   profileName: finalProfileName
                } : s));
             }
          } 
          // If it's a BLEND task, we SUBTRACT proportional weights from ALL assigned silos
          else if (activeLot.type === 'BLEND') {
             // In a perfect system, we'd subtract each origin's proportion.
             // For now, we find silos matching our origins and subtract the proportional actualWeight.
             const updatedSiloIds: number[] = [];
             
             for (const siloId of activeLot.assignedSilos) {
                const s = silos.find(item => item.id === siloId);
                if (!s) continue;
                
                // Find blend percentage for THIS origin in THIS silo
                // (Search by origin name stored in silo or activeLot context)
                const component = activeLot.profile.blend.find(b => s.profileName?.includes(b.origin));
                if (component) {
                   const reduction = actualWeight * (component.percentage / 100);
                   const newKg = Math.max(0, s.currentKg - reduction);
                   const finalProfileName = newKg <= 0.1 ? null : s.profileName;
                   
                   await updateSilo(s.id, { 
                      currentKg: newKg,
                      profileName: finalProfileName
                   });
                   updatedSiloIds.push(s.id);
                   
                   setSilos(prev => prev.map(item => item.id === s.id ? { 
                      ...item, 
                      currentKg: newKg,
                      profileName: finalProfileName
                   } : item));
                }
             }
          }
      }


      setRoastOrders(prev => prev.map(order => {
        if (order?.id === activeLot.parentOrderId) {
          const updatedTasks = order.tasks.map(t => 
            t.id === activeLot?.id ? { 
              ...t, 
              status: 'ROASTED' as const, 
              actualWeightKg: actualWeight, 
              roastedAt: roastedTimestamp,
              roastData: {
                 finalTemp: metrics.finalTemp || 0,
                 finalTime: metrics.finalTime || '0:00',
                 finalRor: metrics.finalRor || 0,
                 devTime: metrics.devTime || 0,
                 chargeTemp: metrics.chargeTemp,
                 chargeTime: metrics.chargeTime,
                 turnaroundTemp: metrics.turnaroundTemp,
                 turnaroundTime: metrics.turnaroundTime,
                 yellowTemp: metrics.yellowTemp,
                 yellowTime: metrics.yellowTime,
                 maillardTemp: metrics.maillardTemp,
                 maillardTime: metrics.maillardTime,
                 firstCrackTemp: metrics.firstCrackTemp,
                 firstCrackTime: metrics.firstCrackTime,
                 agtronColor: metrics.agtronColor
              }
            } : t
          );
          return { ...order, tasks: updatedTasks };
        }
        return order;
      }));
      setActiveLot(null);
      setActiveTab('orders');
    }
  };

  const handleQualityValidated = async (taskId: string, isApproved: boolean, lotNumber?: string) => {
    const nextStatus = isApproved ? 'RESTING' : 'LAB_REJECTED';
    const isSuccess = await updateTaskStatus(taskId, nextStatus, { lotNumber });

    if (!isSuccess) {
      alert("Error: No se pudo registrar la validación en Supabase.");
      return;
    }

    setRoastOrders(prevOrders => prevOrders.map(o => ({
      ...o,
      tasks: o.tasks.map(t => t.id === taskId ? { ...t, status: nextStatus, lotNumber } : t)
    })));

    if (activeLot && activeLot?.id === taskId) {
      setActiveLot({ ...activeLot, status: 'validado' });
    }

    // Auto-return to Operator Panel (Agenda) after validation
    setActiveTab('orders');
  };

  const handleTaskIdChanged = async (oldId: string, newId: string) => {
    // Update local state immediately for UI responsiveness
    setRoastOrders(prevOrders => prevOrders.map(o => ({
      ...o,
      tasks: o.tasks.map(t => t.id === oldId ? { ...t, id: newId } : t)
    })));

    // Try to update in DB
    await updateTaskId(oldId, newId);
  };

  // Stepper UI Component
  const StepperBar = () => {
    const steps = [
      { id: 'definicion', label: '1. Definición', icon: <Target className="w-4 h-4" /> },
      { id: 'tueste', label: '2. Tueste', icon: <Flame className="w-4 h-4" /> },
      { id: 'laboratorio', label: '3. Laboratorio', icon: <TestTube2 className="w-4 h-4" /> },
      { id: 'validado', label: '4. Validado', icon: <CheckCircle className="w-4 h-4" /> }
    ];

    const getStatusIndex = (status: LotStatus) => steps.findIndex(s => s?.id === status);
    const currentIndex = activeLot ? getStatusIndex(activeLot.status) : 0;

    return (
      <div className="w-full bg-[#14161a] border-b border-dashboard-border px-8 py-3 flex items-center justify-between shadow-md z-40 relative">
        <div className="flex items-center space-x-6">
          <span className="text-gray-500 font-black text-xs uppercase tracking-widest flex items-center">
            {activeLot ? <><Database className="w-4 h-4 mr-2 text-coffee-light" /> Lote Activo: <span className="text-white ml-2 bg-[#1e222b] px-2 py-0.5 rounded">{activeLot?.id}</span></> : 'Sin Lote Producción'}
          </span>
        </div>
        <div className="flex items-center space-x-3">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentIndex;
            const isActive = idx === currentIndex && activeLot !== null;

            return (
              <React.Fragment key={step?.id}>
                <div className={`flex items-center px-4 py-1.5 rounded-full text-xs font-bold transition-all
                  ${isActive ? 'bg-coffee-accent text-white shadow-[0_0_15px_rgba(217,119,6,0.3)]' : 
                    isCompleted ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
                    'bg-[#1e222b] text-gray-600 border border-dashboard-border'}`}>
                  <span className="mr-2">{step.icon}</span>
                  {step.label}
                </div>
                {idx < steps.length - 1 && (
                  <div className={`w-8 h-[2px] rounded ${isCompleted ? 'bg-green-500/50' : 'bg-dashboard-border'}`}></div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  // Route Guards for Sidebar navigation
  const handleNavClick = (targetTab: string) => {
    // Prevent skipping steps if a lot is active
    if (activeLot && activeLot.status !== 'validado') {
      if (activeLot.status === 'tueste' && targetTab === 'lab') {
         alert("🔒 Acceso Denegado: Debes finalizar el ciclo de tueste antes de enviar el lote al Quality Lab.");
         return;
      }
    }
    setActiveTab(targetTab as any);
  };

  return (
    <div className="flex h-screen bg-dashboard-bg overflow-hidden relative">
      
      {/* Sidebar - Industrial Minimalist Design */}
      <aside className="w-20 lg:w-64 bg-[#14161a] border-r border-dashboard-border flex flex-col items-center lg:items-start pt-6 shadow-[10px_0_30px_rgba(0,0,0,0.5)] z-20">
        
        {/* Logo Area */}
        <div className="w-full px-0 lg:px-6 mb-8 flex justify-center lg:justify-start items-center">
          <div className="bg-coffee-accent p-2 lg:p-3 rounded-xl shadow-lg ring-1 ring-white/10">
            <Database className="w-6 h-6 lg:w-7 lg:h-7 text-white" />
          </div>
          <span className="hidden lg:block ml-3 font-black text-white tracking-tighter text-lg uppercase leading-none">
            ARBITRADE CANARIAS <span className="text-coffee-light block text-[10px] tracking-[0.3em]">ERP INDUSTRIAL</span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 w-full space-y-1 mt-4 px-3 flex flex-col items-center lg:items-start overflow-y-auto custom-scrollbar pb-6">
          
          {/* MÓDULO PRINCIPAL DE OPERACIÓN */}
          <div className="hidden lg:block w-full px-4 mb-2 mt-2">
            <span className="text-[10px] font-black justify-start text-coffee-accent uppercase tracking-widest">Operación Activa</span>
          </div>
          <NavItem icon={<Package />} label="Planificador de Tueste" active={activeTab === 'planning'} onClick={() => handleNavClick('planning')} highlight={true} />
          <NavItem icon={<Target />} label="Gamas & Recetas" active={activeTab === 'profiles'} onClick={() => handleNavClick('profiles')} />

          {/* MÓDULOS EN PAUSA / OPERACIÓN MANUAL */}
          <div className="w-full mt-6 pt-4 border-t border-dashboard-border/50">
            <button 
              onClick={() => setShowSecondaryModules(!showSecondaryModules)}
              className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-black text-gray-500 hover:text-gray-300 uppercase tracking-widest transition-colors rounded-lg hover:bg-white/5"
            >
              <span className="flex items-center">
                <ChevronDown className={`w-3.5 h-3.5 mr-2 transition-transform ${showSecondaryModules ? '' : '-rotate-90'}`} />
                Módulos en Pausa / Manual
              </span>
              <span className="text-[9px] bg-[#1e222b] px-1.5 py-0.5 rounded text-gray-400 font-mono">7</span>
            </button>

            {showSecondaryModules && (
              <div className="space-y-1 mt-2 pl-1 animate-fadeIn">
                <NavItem icon={<Cpu />} label="Agenda de Tueste" active={activeTab === 'orders'} onClick={() => handleNavClick('orders')} />
                <NavItem icon={<Timer />} label="Control de Tueste" active={activeTab === 'manual_roast'} onClick={() => handleNavClick('manual_roast')} pulse={activeLot?.status === 'tueste'} />
                <NavItem icon={<Database />} label="Gestión de Silos" active={activeTab === 'silos'} onClick={() => handleNavClick('silos')} />
                <NavItem icon={<CheckCircle />} label="Ejecución de Planta" active={activeTab === 'packaging'} onClick={() => handleNavClick('packaging')} />
                <NavItem icon={<TestTube2 />} label="Lab de Calidad" active={activeTab === 'lab'} onClick={() => handleNavClick('lab')} locked={activeLot?.status === 'tueste'} pulse={activeLot?.status === 'laboratorio'} />
                <NavItem icon={<FileSearch />} label="Trazabilidad Forense" active={activeTab === 'traceability'} onClick={() => handleNavClick('traceability')} />
                <NavItem icon={<LayoutDashboard />} label="Panel Ejecutivo" active={activeTab === 'mgmt'} onClick={() => handleNavClick('mgmt')} />
              </div>
            )}
          </div>
        </nav>

        {/* Bottom Current Target */}
        <div className="mt-auto mb-6 w-full px-0 lg:px-6 flex justify-center lg:justify-start items-center">
          <div className="hidden lg:flex w-full bg-[#1e222b] border border-dashboard-border p-4 rounded-xl flex-col shadow-inner relative overflow-hidden">
            {activeLot && activeLot.status === 'validado' && <div className="absolute inset-0 bg-green-500/10 pointer-events-none"></div>}
            <span className="text-[10px] text-gray-500 font-black mb-1 uppercase tracking-widest leading-tight z-10">Lote Activo</span>
            <div className="flex flex-col mt-1 z-10">
              <span className={`text-sm font-bold truncate ${activeLot ? 'text-coffee-light' : 'text-gray-600'}`}>
                {activeLot ? activeLot?.profile?.name : "Ninguno en producción"}
              </span>
              {activeLot && (
                <span className="text-xs text-gray-400 mt-1 font-mono">ID: {activeLot?.id}</span>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Dashboard */}
      <main className="flex-1 min-w-0 h-full flex flex-col relative z-10 overflow-hidden bg-dashboard-bg">
        <StepperBar />
        
        <ErrorBoundary>
          <div className="flex-1 overflow-y-auto w-full relative">
            {activeTab === 'profiles' && <MasterProfiles masterProfiles={masterProfiles} setMasterProfiles={setMasterProfiles} />}
            {activeTab === 'planning' && (
              <DailyRoastOrders 
                masterProfiles={masterProfiles} 
                roastOrders={roastOrders} setRoastOrders={setRoastOrders}
                silos={silos} setSilos={setSilos}
                onLaunchManualRoast={handleLaunchManualRoast}
                forceView="PLAN_MENSUAL"
              />
            )}
            {activeTab === 'packaging' && (
              <DailyRoastOrders 
                masterProfiles={masterProfiles} 
                roastOrders={roastOrders} setRoastOrders={setRoastOrders}
                silos={silos} setSilos={setSilos}
                onLaunchManualRoast={handleLaunchManualRoast}
                forceView="PACKAGING"
              />
            )}
            {activeTab === 'orders' && <DailyRoastOrders 
                masterProfiles={masterProfiles} 
                roastOrders={roastOrders} setRoastOrders={setRoastOrders}
                silos={silos} setSilos={setSilos}
                onLaunchManualRoast={handleLaunchManualRoast}
                forceView="OPERATOR"
              />}
            {activeTab === 'silos' && <SiloManager silos={silos} setSilos={setSilos} />}
            {activeTab === 'mgmt' && <ManagementDashboard />}
            {activeTab === 'roast' && <LiveRoastControl activeLot={activeLot} onRoastComplete={handleBatchComplete} />}
            {activeTab === 'manual_roast' && (
              <ManualRoastControl 
                activeLot={activeLot} 
                onBatchComplete={handleBatchComplete}
                allOrders={roastOrders}
                setAllOrders={setRoastOrders}
                silos={silos}
                setSilos={setSilos}
                session={roastSession}
                setSession={setRoastSession}
              />
            )}
            {activeTab === 'lab' && (
              <QualityLab 
                activeLot={activeLot} 
                roastOrders={roastOrders}
                onQualityValidated={handleQualityValidated}
                onTaskIdChanged={handleTaskIdChanged}
              />
            )}
            {activeTab === 'traceability' && <TraceabilityDetective activeLot={activeLot} />}
          </div>
        </ErrorBoundary>
      </main>

    </div>
  );
}

const NavItem = ({ icon, label, active = false, onClick, highlight = false, pulse = false, locked = false }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void, highlight?: boolean, pulse?: boolean, locked?: boolean }) => {
  return (
    <div onClick={onClick} className={`w-full flex items-center justify-center lg:justify-start px-0 lg:px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 group relative
      ${highlight && !active && !locked ? 'border border-coffee-accent/30 text-coffee-light hover:bg-coffee-accent/10' : ''}
      ${active ? 'bg-coffee-accent/10 border border-coffee-accent/20 text-coffee-light shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]' : 
        locked ? 'text-gray-600 cursor-not-allowed opacity-50' : 'text-gray-400 hover:bg-[#1e222b] hover:text-white'}`}>
      
      <div className={`relative flex items-center justify-center [&>svg]:w-6 [&>svg]:h-6 ${active ? 'text-coffee-light' : locked ? 'text-gray-600' : 'text-gray-400 group-hover:text-white'}`}>
        {icon}
        {pulse && !active && <span className="absolute -top-1 -right-1 w-2 h-2 bg-coffee-accent rounded-full animate-ping"></span>}
        {locked && <Lock className="absolute -bottom-1 -right-2 w-3 h-3 text-red-500 bg-dashboard-bg rounded-full border border-red-500/30" />}
      </div>
      <span className={`hidden lg:block ml-3 text-sm ${active || highlight ? 'font-bold' : locked ? 'line-through' : 'font-medium'}`}>
        {label}
      </span>
      {/* Active Indicator bar */}
      {active && <div className="hidden lg:block absolute left-0 w-1 h-8 bg-coffee-accent rounded-r-md shadow-[0_0_10px_#d97706]" />}
    </div>
  )
}

export default App;
