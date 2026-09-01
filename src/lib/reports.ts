import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DailyRoastOrder, MasterProfile } from '../App';
import type { DailyPlan } from '../components/DailyRoastOrders';
import { getOriginSackWeight } from './api';

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
 * Genera la ficha oficial de 2 páginas de Arbitrade Canarias para cada día de tueste,
 * pre-llenando automáticamente los datos de las tandas calculadas, silos, variedad,
 * cantidades de café verde, totales de Arábica / Robusta y empaquetados por gama.
 */
export const renderArbitradeDaySheet = (
   doc: any,
   day: DailyPlan,
   masterProfiles: MasterProfile[]
) => {
   // Flatten all scheduled batches for the day
   const allBatches: { origin: string; greenKg: number; profileName: string; format: string; siloId: number }[] = [];
   day.siloAssignments.forEach(silo => {
      silo.batches.forEach(b => {
         const sw = getOriginSackWeight(silo.origin, b.profileName, masterProfiles);
         allBatches.push({
            origin: silo.origin.trim(),
            greenKg: sw * 2,
            profileName: b.profileName,
            format: b.format,
            siloId: silo.siloId
         });
      });
   });

   const pageWidth = 297;
   const margin = 10;
   const contentWidth = 277;

   // =========================================================================
   // PÁGINA 1: CONTROL DE TANDAS DE TUESTE (Ficha Técnica de Planta)
   // =========================================================================
   doc.setFillColor(253, 232, 228);
   doc.setDrawColor(0, 0, 0);
   doc.setLineWidth(0.4);
   doc.rect(margin, 9, contentWidth, 11, 'FD');

   doc.setTextColor(0, 0, 0);
   doc.setFontSize(13);
   doc.setFont('helvetica', 'bold');
   doc.text('DIA DE TUESTE ARBITRADE CANARIAS', pageWidth / 2, 16.5, { align: 'center' });

   if (day.scheduledDate) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`FECHA: ${day.scheduledDate} (DÍA #${day.dayIndex})`, contentWidth + margin - 4, 16.5, { align: 'right' });
   }

   // Tabla de 12 filas
   const tableBody: any[] = [];
   for (let i = 1; i <= 12; i++) {
      const batch = allBatches[i - 1];
      if (batch) {
         tableBody.push([
            `${i}`,
            batch.origin,
            `${batch.greenKg}`,
            '', // Lote (en blanco para fábrica)
            '', '', // Inicio: Tº, Tiempo
            '', '', // Punto Inflección: Tº, Tiempo
            '', '', // Etapa Amarilla: Tº, Tiempo
            '', '', // Etapa Marrón: Tº, Tiempo
            '', '', // Primer Crack: Tº, Tiempo
            '', '', // Final Tueste: Tº, Tiempo
            `${batch.siloId}` // SILO Nº
         ]);
      } else {
         tableBody.push([
            `${i}`,
            '', '', '',
            '', '',
            '', '',
            '', '',
            '', '',
            '', '',
            '', '',
            ''
         ]);
      }
   }

   autoTable(doc, {
      startY: 22,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      head: [
         [
            { content: '', colSpan: 1, styles: { fillColor: [255, 238, 0] } },
            { content: 'TUESTE DE CAFÉ', colSpan: 3, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'INICIO', colSpan: 2, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'PUNTO INFLECCIÓN', colSpan: 2, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'ETAPA AMARILLA', colSpan: 2, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'ETAPA MARRÓN', colSpan: 2, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'PRIMER CRACK', colSpan: 2, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'FINAL TUESTE', colSpan: 2, styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'SILO', colSpan: 1, styles: { halign: 'center', fillColor: [255, 238, 0] } }
         ],
         [
            { content: '', styles: { fillColor: [255, 238, 0] } },
            { content: 'Variedad', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Cantidad (Kg)', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Lote', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tº', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tiempo', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tº', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tiempo', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tº', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tiempo', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tº', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tiempo', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tº', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tiempo', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tº', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Tiempo', styles: { halign: 'center', fillColor: [255, 238, 0] } },
            { content: 'Nº', styles: { halign: 'center', fillColor: [255, 238, 0] } }
         ]
      ],
      body: tableBody as any,
      theme: 'grid',
      headStyles: {
         textColor: [0, 0, 0],
         fontStyle: 'bold',
         fontSize: 7.5,
         lineColor: [0, 0, 0],
         lineWidth: 0.35,
         cellPadding: 2
      },
      styles: {
         textColor: [0, 0, 0],
         lineColor: [0, 0, 0],
         lineWidth: 0.35,
         fontSize: 8,
         minCellHeight: 11,
         valign: 'middle'
      },
      columnStyles: {
         0: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
         1: { cellWidth: 36, halign: 'left', fontStyle: 'bold' },
         2: { cellWidth: 21, halign: 'center', fontStyle: 'bold' },
         3: { cellWidth: 18, halign: 'center' },
         4: { cellWidth: 13, halign: 'center' },
         5: { cellWidth: 17, halign: 'center' },
         6: { cellWidth: 13, halign: 'center' },
         7: { cellWidth: 17, halign: 'center' },
         8: { cellWidth: 13, halign: 'center' },
         9: { cellWidth: 17, halign: 'center' },
         10: { cellWidth: 13, halign: 'center' },
         11: { cellWidth: 17, halign: 'center' },
         12: { cellWidth: 13, halign: 'center' },
         13: { cellWidth: 17, halign: 'center' },
         14: { cellWidth: 13, halign: 'center' },
         15: { cellWidth: 17, halign: 'center' },
         16: { cellWidth: 14, halign: 'center', fontStyle: 'bold' }
      }
   });

   // =========================================================================
   // PÁGINA 2: RESUMEN DE CAFÉ VERDE, TOSTADO Y EMPAQUETADO
   // =========================================================================
   doc.addPage('a4', 'landscape');

   // Encabezado Melocotón
   doc.setFillColor(253, 232, 228);
   doc.setDrawColor(0, 0, 0);
   doc.setLineWidth(0.4);
   doc.rect(margin, 9, contentWidth, 11, 'FD');

   doc.setTextColor(0, 0, 0);
   doc.setFontSize(13);
   doc.setFont('helvetica', 'bold');
   doc.text('DIA DE TUESTE ARBITRADE CANARIAS', pageWidth / 2, 16.5, { align: 'center' });

   if (day.scheduledDate) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`FECHA: ${day.scheduledDate} (DÍA #${day.dayIndex})`, contentWidth + margin - 4, 16.5, { align: 'right' });
   }

   let arabicaGreen = 0;
   let robustaGreen = 0;
   allBatches.forEach(b => {
      if (b.origin.toLowerCase().includes('robusta')) {
         robustaGreen += b.greenKg;
      } else {
         arabicaGreen += b.greenKg;
      }
   });

   const arabicaRoasted = Number((arabicaGreen * 0.83).toFixed(1));
   const robustaRoasted = Number((robustaGreen * 0.83).toFixed(1));

   const blocks = day.blocks || [];
   const prod1 = blocks[0] ? `${blocks[0].profileName.toUpperCase()}` : 'MAURICE TIMANFAYA';
   const prod1Kg = blocks[0] ? `${blocks[0].targetKg} kg` : '';

   const prod2 = blocks[1] ? `${blocks[1].profileName.toUpperCase()}` : 'MAURICE LAURSILVA';
   const prod2Kg = blocks[1] ? `${blocks[1].targetKg} kg` : '';

   const prod3 = blocks[2] ? `${blocks[2].profileName.toUpperCase()}` : 'MAURICE PINZÓN AZUL';
   const prod3Kg = blocks[2] ? `${blocks[2].targetKg} kg` : '';

   const topTableHead = [
      [
         { content: 'TOTAL KG CAFÉ VERDE', colSpan: 1, styles: { fillColor: [255, 238, 0], halign: 'center' } },
         { content: 'TOTAL KG CAFÉ TOSTADO', colSpan: 1, styles: { fillColor: [255, 238, 0], halign: 'center' } },
         { content: prod1, colSpan: 3, styles: { fillColor: [255, 238, 0], halign: 'center' } }
      ]
   ];

   const topTableBody = [
      [
         `Arábica: ${arabicaGreen > 0 ? arabicaGreen + ' kg' : ''}`,
         `Arábica: ${arabicaRoasted > 0 ? arabicaRoasted + ' kg' : ''}`,
         { content: `TOTAL KG. EMPAQUETADOS: ${prod1Kg}`, styles: { halign: 'left' } },
         { content: 'Nº LOTE:', styles: { halign: 'left' } },
         { content: 'FECHA DE CADUCIDAD:', styles: { halign: 'left' } }
      ],
      [
         { content: '', colSpan: 2, styles: { fillColor: [255, 255, 255] } },
         { content: prod2, colSpan: 3, styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } }
      ],
      [
         `Robusta: ${robustaGreen > 0 ? robustaGreen + ' kg' : ''}`,
         `Robusta: ${robustaRoasted > 0 ? robustaRoasted + ' kg' : ''}`,
         { content: `TOTAL KG. EMPAQUETADOS: ${prod2Kg}`, styles: { halign: 'left' } },
         { content: 'Nº LOTE:', styles: { halign: 'left' } },
         { content: 'FECHA DE CADUCIDAD:', styles: { halign: 'left' } }
      ],
      [
         { content: '', colSpan: 2, styles: { fillColor: [255, 255, 255] } },
         { content: prod3, colSpan: 3, styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } }
      ],
      [
         { content: '', colSpan: 2, styles: { fillColor: [255, 255, 255] } },
         { content: `TOTAL KG. EMPAQUETADOS: ${prod3Kg}`, styles: { halign: 'left' } },
         { content: 'Nº LOTE:', styles: { halign: 'left' } },
         { content: 'FECHA DE CADUCIDAD:', styles: { halign: 'left' } }
      ]
   ];

   autoTable(doc, {
      startY: 22,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      head: topTableHead as any,
      body: topTableBody as any,
      theme: 'grid',
      headStyles: {
         textColor: [0, 0, 0],
         fontStyle: 'bold',
         fontSize: 8.5,
         lineColor: [0, 0, 0],
         lineWidth: 0.35,
         cellPadding: 2
      },
      styles: {
         textColor: [0, 0, 0],
         lineColor: [0, 0, 0],
         lineWidth: 0.35,
         fontSize: 8,
         minCellHeight: 9,
         valign: 'middle'
      },
      columnStyles: {
         0: { cellWidth: 46 },
         1: { cellWidth: 46 },
         2: { cellWidth: 65 },
         3: { cellWidth: 55 },
         4: { cellWidth: 65 }
      }
   });

   let yOffset = (doc as any).lastAutoTable.finalY + 5;

   // SECCIÓN 2: CAFÉ DE ESPECIALIDAD
   autoTable(doc, {
      startY: yOffset,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      head: [
         [{ content: 'CAFÉ DE ESPECIALIDAD', colSpan: 6, styles: { fillColor: [255, 238, 0], halign: 'center', fontSize: 11, fontStyle: 'bold' } }]
      ],
      body: [
         // Fila 1
         [
            { content: 'TOTAL KG CAFÉ VERDE', styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } },
            { content: 'TOTAL KG CAFÉ TOSTADO', styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } },
            { content: 'ORIGEN:', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } },
            { content: 'ORIGEN:', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } }
         ],
         [
            '', '',
            { content: 'TOTAL KG. EMPAQUETADOS', styles: { halign: 'center', fontSize: 7.5 } },
            { content: 'Nº LOTE Y CADUCIDAD', styles: { halign: 'center', fontSize: 7.5 } },
            { content: 'TOTAL KG. EMPAQUETADOS', styles: { halign: 'center', fontSize: 7.5 } },
            { content: 'Nº LOTE Y CADUCIDAD', styles: { halign: 'center', fontSize: 7.5 } }
         ],
         // Fila 2
         [
            { content: 'TOTAL KG CAFÉ VERDE', styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } },
            { content: 'TOTAL KG CAFÉ TOSTADO', styles: { fillColor: [255, 238, 0], halign: 'center', fontStyle: 'bold' } },
            { content: 'ORIGEN:', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } },
            { content: 'ORIGEN:', colSpan: 2, styles: { halign: 'left', fontStyle: 'bold' } }
         ],
         [
            '', '',
            { content: 'TOTAL KG. EMPAQUETADOS', styles: { halign: 'center', fontSize: 7.5 } },
            { content: 'Nº LOTE Y CADUCIDAD', styles: { halign: 'center', fontSize: 7.5 } },
            { content: 'TOTAL KG. EMPAQUETADOS', styles: { halign: 'center', fontSize: 7.5 } },
            { content: 'Nº LOTE Y CADUCIDAD', styles: { halign: 'center', fontSize: 7.5 } }
         ]
      ],
      theme: 'grid',
      styles: {
         textColor: [0, 0, 0],
         lineColor: [0, 0, 0],
         lineWidth: 0.35,
         fontSize: 8,
         minCellHeight: 8.5,
         valign: 'middle'
      },
      columnStyles: {
         0: { cellWidth: 46 },
         1: { cellWidth: 46 },
         2: { cellWidth: 46 },
         3: { cellWidth: 47 },
         4: { cellWidth: 46 },
         5: { cellWidth: 46 }
      }
   });

   yOffset = (doc as any).lastAutoTable.finalY + 6;

   // SECCIÓN 3: ENTREGA EN ALMACÉN Y FIRMAS DE CONTROL
   doc.setDrawColor(0, 0, 0);
   doc.setLineWidth(0.4);
   doc.rect(margin, yOffset, 95, 24);
   doc.setFontSize(8);
   doc.setFont('helvetica', 'bold');
   doc.text('Día que se entrega la mercancía en el almacén:', margin + 3, yOffset + 7);
   doc.text('¿Se entregó el total de la mercancía?:', margin + 3, yOffset + 17);
   doc.setFont('helvetica', 'normal');
   doc.text('SI       NO', margin + 65, yOffset + 17);

   doc.rect(margin + 99, yOffset, 75, 24);
   doc.setFont('helvetica', 'bold');
   doc.text('Si la respuesta es NO, kg entregados:', margin + 102, yOffset + 7);

   doc.rect(margin + 178, yOffset, 99, 24);
   doc.setFont('helvetica', 'bold');
   doc.text('Revisado por:', margin + 181, yOffset + 6);
   doc.text('Responsable de Compras y Almacén:', margin + 181, yOffset + 12);
   doc.text('Firma:', margin + 181, yOffset + 19);
};

export const generateSingleDayPlanReport = (day: DailyPlan, masterProfiles: MasterProfile[]) => {
   const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
   });

   renderArbitradeDaySheet(doc, day, masterProfiles);

   const dayLabel = day.scheduledDate ? day.scheduledDate.replace(/\//g, '-') : `DIA_${day.dayIndex}`;
   doc.save(`DIA_TUESTE_ARBITRADE_CANARIAS_DIA_${day.dayIndex}_${dayLabel}.pdf`);
};

export const generateRoastingPlanReport = (days: DailyPlan[], masterProfiles: MasterProfile[], monthStr?: string) => {
   const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
   });

   days.forEach((day, idx) => {
      if (idx > 0) {
         doc.addPage('a4', 'landscape');
      }
      renderArbitradeDaySheet(doc, day, masterProfiles);
   });

   const safeMonth = (monthStr || 'MES').replace(/\s+/g, '_');
   doc.save(`PLAN_TUESTE_ARBITRADE_CANARIAS_${safeMonth}.pdf`);
};
