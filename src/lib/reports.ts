import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DailyRoastOrder, MasterProfile } from '../App';
import type { DailyPlan } from '../components/DailyRoastOrders';

/**
 * Utility to get format weight in KG
 */
const getFormatWeight = (format: string): number => {
   const f = format.toLowerCase();
   if (f.includes('250g')) return 0.25;
   if (f.includes('450g')) return 0.45;
   if (f.includes('500g')) return 0.5;
   if (f.includes('1000g') || f.includes('1kg')) return 1;
   if (f.includes('2kg')) return 2;
   return 1; // Default
};

/**
 * Genera un informe profesional en PDF con el desglose detallado de la producción diaria.
 */
export const generateDailyProductionReport = (orders: DailyRoastOrder[]) => {
   const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
   });
   
   const today = new Date().toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
   });

   doc.setFillColor(30, 34, 43);
   doc.rect(0, 0, 297, 40, 'F');
   doc.setTextColor(217, 119, 6);
   doc.setFontSize(24);
   doc.setFont('helvetica', 'bold');
   doc.text('COFFEE FLOW - ARBITRADE CANARIAS', 15, 20);
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(12);
   doc.text(`INFORME DIARIO DE PRODUCCIÓN Y TRAZABILIDAD - ${today}`, 15, 30);

   const roastTasks = orders.flatMap(o => o.tasks.filter(t => t.type === 'ROAST' && (t.status === 'ROASTED' || t.status === 'RESTING' || t.status === 'COMPLETED')));
   const totalRoastedKg = roastTasks.reduce((acc, t) => acc + (t.actualWeightKg || 0), 0);
   const totalGreenKg = roastTasks.reduce((acc, t) => acc + (t.targetWeightKg || 0), 0);
   const avgShrinkage = totalGreenKg > 0 ? ((totalGreenKg - totalRoastedKg) / totalGreenKg * 100).toFixed(2) : '0.00';
   
   const originsKg: { [origin: string]: number } = {};
   roastTasks.forEach(t => {
      const origin = t.origins[0] || 'Origen Desconocido';
      originsKg[origin] = (originsKg[origin] || 0) + (t.targetWeightKg || 0);
   });
   
   doc.setTextColor(40, 40, 40);
   doc.text('RESUMEN DE JORNADA:', 15, 52);
   
   autoTable(doc, {
      startY: 55,
      margin: { left: 15 },
      tableWidth: 100,
      body: [
         ['Total Café Verde Procesado', `${totalGreenKg.toFixed(1)} kg`],
         ...Object.entries(originsKg).map(([origin, kg]) => [`  - ${origin}`, `${kg.toFixed(1)} kg`]),
         ['Total Café Tostado Producido', `${totalRoastedKg.toFixed(1)} kg`],
         ['Merma Promedio del Día', `${avgShrinkage} %`]
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 1 }
   });

   const allTasks = orders.flatMap(o => o.tasks.filter(t => t.status === 'ROASTED' || t.status === 'RESTING' || t.status === 'COMPLETED'));
   let batchCounter = 0;
   const tableRows = allTasks.flatMap(t => {
      if (t.type === 'BLEND') return [];
      batchCounter++;
      const rd = t.roastData || {} as any;
      return [[
         batchCounter.toString(),
         `${t.origins[0] || 'Origen'}\n(${t.masterProfile?.name || 'Gama'})`,
         `${t.targetWeightKg.toFixed(1)} / ${t.actualWeightKg?.toFixed(1) || '--'}`,
         t.actualWeightKg ? (((t.targetWeightKg - t.actualWeightKg) / t.targetWeightKg) * 100).toFixed(1) + '%' : '--',
         rd.turnaroundTemp ? `${rd.turnaroundTemp}°C\n(${rd.turnaroundTime || '0:00'})` : '--',
         rd.yellowTemp ? `${rd.yellowTemp}°C\n(${rd.yellowTime || '0:00'})` : '--',
         rd.maillardTemp ? `${rd.maillardTemp}°C\n(${rd.maillardTime || '0:00'})` : '--',
         rd.firstCrackTemp ? `${rd.firstCrackTemp}°C\n(${rd.firstCrackTime || '0:00'})` : '--',
         rd.finalTemp ? `${rd.finalTemp}°C\n(${rd.finalTime || '0:00'})` : '--',
         t.assignedSilos ? `Silo ${t.assignedSilos[0]}` : '--'
      ]];
   });

   autoTable(doc, {
      startY: 85,
      head: [['#', 'Origen / Perfil', 'Verde/Tost', 'Merma', 'TP', 'Amar.', 'Mail.', '1C', 'Drop', 'Silo']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], fontSize: 8 },
      styles: { fontSize: 8, halign: 'center' }
   });

   doc.save(`INFORME_PRODUCCION_${today.replace(/[\/:]/g, '_')}.pdf`);
};

/**
 * Genera una Orden de Envasado Detallada.
 */
export const generatePackagingOrderReport = (orders: DailyRoastOrder[], demands: any[] = []) => {
   const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
   });

   const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
   doc.setFillColor(30, 34, 43);
   doc.rect(0, 0, 297, 30, 'F');
   doc.setTextColor(217, 119, 6);
   doc.setFontSize(20);
   doc.text('ARBITRADE - ORDEN DE ENVASADO Y LOGÍSTICA', 15, 15);
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(10);
   doc.text(`PLAN DE ENVASADO - JORNADA ${today} | 1 Caja = 12kg | 1 Pallet = 40 Cajas`, 15, 22);

   const packagingTasks = orders.flatMap(o => o.tasks.filter(t => t.type === 'BLEND'));

   const tableRows = packagingTasks.map((t, idx) => {
      const profile = t.masterProfile;
      const format = (profile as any)?.format || '1000g';
      const weight = getFormatWeight(format);
      
      const totalKg = t.targetWeightKg;
      const packages = Math.round(totalKg / weight);
      const boxes = totalKg / 12;
      const pallets = boxes / 40;

      // Find delegation from demands
      let delegation = 'STOCK / PROPIA';
      if (t.fulfilledDemandIds && t.fulfilledDemandIds.length > 0) {
         const demand = demands.find(d => d.id === t.fulfilledDemandIds![0]);
         if (demand) delegation = demand.delegation;
      }

      // Dynamically calculate which silos actually contain this gama's origins
      const parentOrder = orders.find(o => o.id === t.parentOrderId);
      const profileSilos = parentOrder ? Array.from(new Set(
         parentOrder.tasks
            .filter(rt => rt.type === 'ROAST' && rt.masterProfile?.name === t.masterProfile?.name)
            .flatMap(rt => rt.assignedSilos || [])
      )).sort((a,b) => a-b) : (t.assignedSilos || []);

      return [
         (idx + 1).toString(),
         delegation,
         profile?.name || 'GAMA',
         format,
         `${totalKg.toFixed(1)} kg`,
         packages.toLocaleString(),
         boxes.toFixed(1),
         pallets.toFixed(2),
         profileSilos.length > 0 ? profileSilos.join(', ') : '--'
      ];
   });

   autoTable(doc, {
      startY: 40,
      head: [['#', 'Delegación', 'Gama', 'Formato', 'Total Kg', 'Paquetes', 'Cajas (12kg)', 'Pallets (40c)', 'Silos']],
      body: tableRows,
      headStyles: { fillColor: [30, 34, 43], fontSize: 9 },
      styles: { fontSize: 9, halign: 'center' },
      columnStyles: { 1: { halign: 'left', fontStyle: 'bold' }, 2: { halign: 'left' } }
   });

   doc.save(`ORDEN_ENVASADO_${today.replace(/\//g, '_')}.pdf`);
};

/**
 * Genera el Informe de Paletizado por Delegación.
 */
export const generatePalletShippingReport = (orders: DailyRoastOrder[], demands: any[] = []) => {
   const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
   });

   const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
   doc.setFillColor(30, 34, 43);
   doc.rect(0, 0, 210, 30, 'F');
   doc.setTextColor(217, 119, 6);
   doc.setFontSize(18);
   doc.text('ARBITRADE - HOJA DE PALETIZADO Y ENVÍO', 15, 15);
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(10);
   doc.text(`DESGLOSE POR PALLETS Y DELEGACIÓN - ${today}`, 15, 22);

   const packagingTasks = orders.flatMap(o => o.tasks.filter(t => t.type === 'BLEND'));
   
   // Group tasks by Delegation
   const tasksByDelegation: { [key: string]: any[] } = {};
   packagingTasks.forEach(t => {
      let delegation = 'STOCK / PROPIA';
      if (t.fulfilledDemandIds && t.fulfilledDemandIds.length > 0) {
         const demand = demands.find(d => d.id === t.fulfilledDemandIds![0]);
         if (demand) delegation = demand.delegation;
      }
      if (!tasksByDelegation[delegation]) tasksByDelegation[delegation] = [];
      tasksByDelegation[delegation].push(t);
   });

   let currentY = 40;

   Object.entries(tasksByDelegation).forEach(([delegation, tasks]) => {
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'bold');
      doc.text(`DELEGACIÓN: ${delegation}`, 15, currentY);
      currentY += 5;

      // Group into pallets (480kg per pallet = 40 boxes of 12kg)
      const PALLET_CAPACITY_KG = 480;
      let pallets: { kg: number, items: { name: string, kg: number }[] }[] = [{ kg: 0, items: [] }];

      tasks.forEach(t => {
         let remainingKg = t.targetWeightKg;
         while (remainingKg > 0) {
            let currentPallet = pallets[pallets.length - 1];
            const spaceInPallet = PALLET_CAPACITY_KG - currentPallet.kg;
            
            if (spaceInPallet <= 0) {
               pallets.push({ kg: 0, items: [] });
               currentPallet = pallets[pallets.length - 1];
            }

            const kgToAdd = Math.min(remainingKg, PALLET_CAPACITY_KG - currentPallet.kg);
            currentPallet.kg += kgToAdd;
            currentPallet.items.push({ name: t.masterProfile?.name || 'GAMA', kg: kgToAdd });
            remainingKg -= kgToAdd;
         }
      });

      const palletRows = pallets.map((p, idx) => [
         `PALLET #${idx + 1}`,
         p.items.map(i => `${i.name}: ${Math.ceil(i.kg / 12)} cj (${i.kg.toFixed(1)}kg)`).join('\n'),
         `${p.kg.toFixed(1)} kg`,
         Math.ceil(p.kg / 12).toString() + ' Cajas'
      ]);

      autoTable(doc, {
         startY: currentY,
         head: [['# Pallet', 'Gamas Incluidas', 'Peso Total', 'Cajas Estimadas']],
         body: palletRows,
         theme: 'grid',
         headStyles: { fillColor: [100, 100, 100] },
         styles: { fontSize: 9 },
         margin: { left: 15 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;
      if (currentY > 250) {
         doc.addPage();
         currentY = 20;
      }
   });

   doc.save(`HOJA_PALETIZADO_${today.replace(/\//g, '_')}.pdf`);
};

/**
 * Genera un informe en PDF de toda la planificación de tueste generada.
 */
// Helper to render a single day worksheet into a jsPDF document for factory floor
const renderDayWorksheet = (
   doc: any,
   day: DailyPlan,
   masterProfiles: MasterProfile[],
   today: string
) => {
   // Header Banner
   doc.setFillColor(30, 34, 43);
   doc.rect(0, 0, 210, 28, 'F');
   doc.setTextColor(217, 119, 6);
   doc.setFontSize(16);
   doc.setFont('helvetica', 'bold');
   doc.text('HOJA DE TRABAJO DE TUESTE - PLANTA', 15, 12);
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(9);
   const dateStr = day.scheduledDate ? ` | Fecha Prevista: ${day.scheduledDate}` : ` | Emitido: ${today}`;
   doc.text(`JORNADA #${day.dayIndex}${dateStr} | Silos Asignados: Silos ${day.targetSilos.join(', ')}`, 15, 20);

   let yOffset = 33;

   // Calculate green coffee usage for this day
   let dayTotalGreen = 0;
   const greenByOrigin: { [origin: string]: { kg: number, sacks: number } } = {};

   day.siloAssignments.forEach(silo => {
      silo.batches.forEach(batch => {
         const profile = masterProfiles.find(p => p.name === batch.profileName);
         if (!profile) return;
         const blendComponent = profile.blend.find(b => b.origin === silo.origin);
         const sackWeight = Number(blendComponent?.sackWeight || (blendComponent as any)?.sack_weight || 60);
         const batchGreen = sackWeight * 2;
         dayTotalGreen += batchGreen;
         if (!greenByOrigin[silo.origin]) {
            greenByOrigin[silo.origin] = { kg: 0, sacks: 0 };
         }
         greenByOrigin[silo.origin].kg += batchGreen;
         greenByOrigin[silo.origin].sacks += 2;
      });
   });

   // Resumen de la Jornada
   const summaryRows = [
      ['Café Tostado Objetivo:', `${day.totalKg.toFixed(1)} kg`, 'Café Verde Requerido:', `${dayTotalGreen.toFixed(1)} kg`],
      ['Silos de Tostado:', `Silos ${day.targetSilos.join(', ')}`, 'Total Sacos Verde:', `${Object.values(greenByOrigin).reduce((acc, v) => acc + v.sacks, 0)} sacos`],
      ['Desglose de Café Verde:', Object.entries(greenByOrigin).map(([orig, v]) => `${orig}: ${v.kg} kg (${v.sacks} sc)`).join(' | '), 'Estado:', '[  ] PENDIENTE DE TUESTE']
   ];

   autoTable(doc, {
      startY: yOffset,
      margin: { left: 15, right: 15 },
      body: summaryRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5, textColor: [30, 30, 30] },
      columnStyles: {
         0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 42 },
         1: { cellWidth: 48 },
         2: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 42 },
         3: { cellWidth: 48 }
      }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 4;

   // Table of Roasting Batches/Silo allocations with Checkbox and Real Weight
   const batchRows: any[] = [];
   let batchCounter = 1;

   day.siloAssignments.forEach(silo => {
      silo.batches.forEach((batch) => {
         const profile = masterProfiles.find(p => p.name === batch.profileName);
         const blendComponent = profile?.blend.find(b => b.origin === silo.origin);
         const sackWeight = Number(blendComponent?.sackWeight || (blendComponent as any)?.sack_weight || 60);
         const greenKg = sackWeight * 2;
         
         batchRows.push([
            '[  ]',
            `#${batchCounter++}`,
            `Silo ${silo.siloId}`,
            silo.origin,
            `2 sacos (${greenKg} kg)`,
            batch.profileName,
            batch.format,
            '____________'
         ]);
      });
   });

   doc.setFontSize(8.5);
   doc.setFont('helvetica', 'bold');
   doc.setTextColor(40, 40, 40);
   doc.text('CONTROL Y REGISTRO DE TANDAS EN PLANTA (Marcar con bolígrafo al tostar):', 15, yOffset);
   yOffset += 2.5;

   autoTable(doc, {
      startY: yOffset,
      margin: { left: 15, right: 15 },
      head: [['OK', 'Nº', 'Silo', 'Origen Verde', 'Carga Verde', 'Gama / Perfil', 'Formato', 'Tostado Real']],
      body: batchRows,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], fontSize: 8, halign: 'center' },
      styles: { fontSize: 7.5, cellPadding: 1.8, halign: 'left' },
      columnStyles: {
         0: { halign: 'center', cellWidth: 12, fontStyle: 'bold' },
         1: { halign: 'center', cellWidth: 10 },
         2: { halign: 'center', fontStyle: 'bold', cellWidth: 16 },
         3: { cellWidth: 26 },
         4: { cellWidth: 26 },
         5: { fontStyle: 'bold', cellWidth: 44 },
         6: { cellWidth: 18 },
         7: { halign: 'center', cellWidth: 28 }
      }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 6;

   // Cuadro de Observaciones y Firmas
   if (yOffset > 240) {
      doc.addPage();
      yOffset = 20;
   }

   doc.setDrawColor(180, 180, 180);
   doc.setLineDashPattern([1, 1], 0);
   doc.roundedRect(15, yOffset, 180, 26, 2, 2, 'S');

   doc.setFontSize(7.5);
   doc.setFont('helvetica', 'bold');
   doc.setTextColor(80, 80, 80);
   doc.text('INCIDENCIAS / OBSERVACIONES DEL TOSTADOR:', 18, yOffset + 5);

   doc.setFont('helvetica', 'normal');
   doc.text('Merma observada / Temperaturas / Silos: ________________________________________________________________________', 18, yOffset + 12);
   doc.text('__________________________________________________________________________________________________________________', 18, yOffset + 19);

   yOffset += 32;

   doc.setFontSize(7.5);
   doc.setFont('helvetica', 'bold');
   doc.text('Operario Tostador: ___________________________', 15, yOffset);
   doc.text('Firma Operario: ___________________________', 80, yOffset);
   doc.text('VºBº Calidad / Planta: ___________________________', 145, yOffset);
};

export const generateSingleDayPlanReport = (day: DailyPlan, masterProfiles: MasterProfile[]) => {
   const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
   });

   const today = new Date().toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
   });

   renderDayWorksheet(doc, day, masterProfiles, today);

   const dayLabel = day.scheduledDate ? day.scheduledDate.replace(/\//g, '-') : `DIA_${day.dayIndex}`;
   doc.save(`FICHA_TUESTE_DIA_${day.dayIndex}_${dayLabel}.pdf`);
};

export const generateRoastingPlanReport = (days: DailyPlan[], masterProfiles: MasterProfile[], monthStr?: string) => {
   const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
   });

   const today = new Date().toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
   });

   // PAGE 1: COVER & MONTHLY PROCUREMENT SUMMARY
   doc.setFillColor(30, 34, 43);
   doc.rect(0, 0, 210, 30, 'F');
   doc.setTextColor(217, 119, 6);
   doc.setFontSize(17);
   doc.setFont('helvetica', 'bold');
   doc.text('COFFEE FLOW - PLAN GENERAL DE TUESTE', 15, 13);
   doc.setTextColor(255, 255, 255);
   doc.setFontSize(9);
   doc.text(`PLANIFICACIÓN MENSUAL Y APROVISIONAMIENTO DE CAFÉ VERDE | ${monthStr || 'MES COMPLETO'}`, 15, 22);

   let yOffset = 38;

   // Calculate global totals
   let globalTotalRoasted = 0;
   let globalTotalGreen = 0;
   const globalGreenByOrigin: { [origin: string]: { kg: number, sacks: number } } = {};
   const globalBlocks: { [key: string]: { profileName: string, format: string, totalKg: number, days: number[] } } = {};

   days.forEach(day => {
      globalTotalRoasted += day.totalKg;
      
      day.siloAssignments.forEach(silo => {
         silo.batches.forEach(batch => {
            const profile = masterProfiles.find(p => p.name === batch.profileName);
            if (!profile) return;
            const blendComponent = profile.blend.find(b => b.origin === silo.origin);
            const sackWeight = Number(blendComponent?.sackWeight || (blendComponent as any)?.sack_weight || 60);
            const batchGreen = sackWeight * 2;
            globalTotalGreen += batchGreen;
            if (!globalGreenByOrigin[silo.origin]) {
               globalGreenByOrigin[silo.origin] = { kg: 0, sacks: 0 };
            }
            globalGreenByOrigin[silo.origin].kg += batchGreen;
            globalGreenByOrigin[silo.origin].sacks += 2;
         });
      });

      day.blocks.forEach(b => {
         const key = `${b.profileName}__${b.format}`;
         if (!globalBlocks[key]) {
            globalBlocks[key] = { profileName: b.profileName, format: b.format, totalKg: 0, days: [] };
         }
         globalBlocks[key].totalKg += b.targetKg;
         if (!globalBlocks[key].days.includes(day.dayIndex)) {
            globalBlocks[key].days.push(day.dayIndex);
         }
      });
   });

   // Resumen Ejecutivo
   const kpiRows = [
      ['Jornadas de Producción:', `${days.length} Días de Tueste`, 'Total Café Tostado Neto:', `${globalTotalRoasted.toFixed(1)} kg`],
      ['Total Café Verde Necesario:', `${globalTotalGreen.toFixed(1)} kg`, 'Total Sacos Verde (60kg):', `${Object.values(globalGreenByOrigin).reduce((acc, v) => acc + v.sacks, 0)} sacos`]
   ];

   autoTable(doc, {
      startY: yOffset,
      margin: { left: 15, right: 15 },
      body: kpiRows,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2 },
      columnStyles: {
         0: { fontStyle: 'bold', fillColor: [240, 240, 240], cellWidth: 48 },
         1: { fontStyle: 'bold', textColor: [217, 119, 6], cellWidth: 42 },
         2: { fontStyle: 'bold', fillColor: [240, 240, 240], cellWidth: 48 },
         3: { fontStyle: 'bold', textColor: [30, 120, 30], cellWidth: 42 }
      }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 8;

   // Tabla 1: Aprovisionamiento de Café Verde por Origen
   doc.setFontSize(10);
   doc.setFont('helvetica', 'bold');
   doc.setTextColor(40, 40, 40);
   doc.text('1. APROVISIONAMIENTO DE CAFÉ VERDE (Necesidades de Almacén / Compras):', 15, yOffset);
   yOffset += 3;

   const greenRows = Object.entries(globalGreenByOrigin).map(([origin, val]) => {
      const pct = globalTotalGreen > 0 ? ((val.kg / globalTotalGreen) * 100).toFixed(1) : '0';
      return [
         origin,
         `${val.kg.toFixed(1)} kg`,
         `${val.sacks} sacos`,
         `${pct} %`
      ];
   });

   autoTable(doc, {
      startY: yOffset,
      margin: { left: 15, right: 15 },
      head: [['Origen / Variedad', 'Kg Verde Requerido', 'Sacos Estimados (60kg)', '% del Consumo Verde']],
      body: greenRows,
      theme: 'striped',
      headStyles: { fillColor: [40, 40, 40], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 1.8 }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 8;

   // Tabla 2: Gamas y Formatos Mensuales
   doc.setFontSize(10);
   doc.setFont('helvetica', 'bold');
   doc.setTextColor(40, 40, 40);
   doc.text('2. DESGLOSE MENSUAL POR GAMA Y FORMATO:', 15, yOffset);
   yOffset += 3;

   const productRows = Object.values(globalBlocks).map(p => [
      p.profileName,
      p.format,
      `${p.totalKg.toFixed(1)} kg`,
      p.days.map(d => `Día ${d}`).join(', ')
   ]);

   autoTable(doc, {
      startY: yOffset,
      margin: { left: 15, right: 15 },
      head: [['Gama / Perfil', 'Formato', 'Total Tostado Previsto', 'Jornadas de Fabricación']],
      body: productRows,
      theme: 'striped',
      headStyles: { fillColor: [80, 80, 80], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 1.8 }
   });

   // SUBSEQUENT PAGES: EACH DAY WORKSHEET
   days.forEach(day => {
      doc.addPage();
      renderDayWorksheet(doc, day, masterProfiles, today);
   });

   const safeMonth = (monthStr || 'GENERAL').replace(/\s+/g, '_');
   doc.save(`PLAN_MENSUAL_TUESTE_${safeMonth}_${today.replace(/\//g, '_')}.pdf`);
};
