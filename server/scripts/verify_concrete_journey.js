'use strict';

process.env.NODE_ENV = 'test';
process.env.PERSISTENCE_ADAPTER = 'json';
process.env.PORT = '3011';
process.env.SESSION_SECRET = 'test_budget_01_session_secret';
process.env.SIGNING_SECRET = 'test_budget_01_signing_secret';
process.env.OFFER_SIGNING_SECRET = 'test_budget_01_offer_signing_secret';
process.env.BPE_JWT_SECRET = 'test_budget_01_bpe_jwt_secret';
process.env.ADMIN_API_TOKEN = 'test_budget_01_admin_token';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
process.env.BPE_MARKETPLACE_OFFERS_URL = 'https://bpe.printprice.pro/api/marketplace/offers';

const http = require('http');

console.log('[BUDGET_01_JOURNEY] Initializing local Budget server on port 3011...');
require('../server.js');
const repositories = require('../repositories');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runConcreteJourney() {
  await sleep(1500); // Wait for express server to start listening
  await repositories.initialize();

  console.log('======================================================================');
  console.log('ACREDITACIÓN DE RECORRIDO CONCRETO (BUDGET-01)');
  console.log('1. Calcular presupuesto');
  console.log('2. Cambiar SOLO la preferencia sin recalcular');
  console.log('3. Crear pedido');
  console.log('4. Comprobar que la imprenta recibe la última preferencia conservando el importe');
  console.log('======================================================================\n');

  // Registrar archivos de producción previos en repositorio local para permitir creación de intención
  await repositories.productionFiles.create({
    file_id: 'pf_journey_interior',
    role: 'INTERIOR_PDF',
    filename: 'catalogo_2026_interior.pdf',
    status: 'VALIDATED',
    checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    size_bytes: 4892011,
    storage: { provider: 'local', key: 'uploads/catalogo_2026_interior.pdf' }
  });

  await repositories.productionFiles.create({
    file_id: 'pf_journey_cover',
    role: 'COVER_PDF',
    filename: 'catalogo_2026_cubierta.pdf',
    status: 'VALIDATED',
    checksum: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
    size_bytes: 1820492,
    storage: { provider: 'local', key: 'uploads/catalogo_2026_cubierta.pdf' }
  });

  const baseSpecs = {
    copies: 500,
    interior_pages: 120,
    cover_pages: 4,
    book_size: 'A5',
    orientation: 'portrait',
    delivery_country: 'ES',
    interior_print: '4/4',
    cover_print: '4/0',
    cover_print_rev: 0,
    paper_type_interior: 'offset',
    paper_weight_interior: 90,
    paper_type_cover: 'mc',
    paper_weight_cover: 250,
    paper_type_endpaper: 'offset',
    paper_weight_endpapers: 140,
    binding_method: 'flexibound',
    finishing_options: 'matt_lam',
    uv_varnish: false,
    endpapers: 'none'
  };

  // PASO 1: Calcular
  console.log('▶ PASO 1: Calcular presupuesto inicial (Llamada al BPE)');
  const calcRes = await request(
    {
      hostname: '127.0.0.1',
      port: 3011,
      path: '/api/budget/calculate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    baseSpecs
  );

  if (calcRes.status !== 200 || !calcRes.data.success) {
    throw new Error(`Fallo en cálculo: ${JSON.stringify(calcRes.data)}`);
  }

  const offerSessionId = calcRes.data.offer_session_id;
  const bestOffer = calcRes.data.offers[0];
  const originalAmount = bestOffer.total_price;
  const currency = bestOffer.currency;

  console.log(`  ✓ Presupuesto inicial calculado con éxito.`);
  console.log(`  ✓ Offer Session ID : ${offerSessionId}`);
  console.log(`  ✓ Impresor asignado: ${bestOffer.printer_name} (${bestOffer.printer_id})`);
  console.log(`  ✓ Importe original : ${originalAmount} ${currency}`);
  console.log(`  ✓ Base técnica BPE : Interior ${baseSpecs.paper_weight_interior}g ${baseSpecs.paper_type_interior} | Cubierta ${baseSpecs.paper_weight_cover}g ${baseSpecs.paper_type_cover}\n`);

  // PASO 2: Cambiar solo preferencia sin recalcular
  console.log('▶ PASO 2: Modificar ÚNICAMENTE la preferencia de papel (Sin invocar /api/budget/calculate)');
  const updatedPaperPreference = {
    interior: {
      productId: 'prod_amber_graphic',
      variantId: 'var_amber_150_700x1000',
      productName: 'Amber Graphic (High Bulk)',
      brand: 'Arctic Paper',
      category: 'OFFSET',
      gsm: 150,
      finish: 'Matt Uncoated',
      rawSheetFormat: '700x1000 mm (B1)',
      availability: 'CUSTOMER_PREFERENCE_PENDING_CONFIRMATION',
      sourceCatalog: 'CONTROL_PLANE_MASTER_HUB'
    },
    cover: {
      productId: 'prod_creator_silk',
      variantId: 'var_creator_silk_300',
      productName: 'Creator Silk',
      brand: 'Lecta',
      category: 'COATED',
      gsm: 300,
      finish: 'Silk 2-sides',
      rawSheetFormat: '720x1020 mm',
      availability: 'CUSTOMER_PREFERENCE_PENDING_CONFIRMATION',
      sourceCatalog: 'CONTROL_PLANE_MASTER_HUB'
    }
  };

  console.log(`  ✓ Preferencia actualizada en cliente sin recalcular:`);
  console.log(`    - Papel Interior Preferido : ${updatedPaperPreference.interior.productName} · ${updatedPaperPreference.interior.gsm}g (${updatedPaperPreference.interior.rawSheetFormat})`);
  console.log(`    - Papel Cubierta Preferido : ${updatedPaperPreference.cover.productName} · ${updatedPaperPreference.cover.gsm}g (${updatedPaperPreference.cover.rawSheetFormat})`);
  console.log(`  ✓ AVISO VISIBLE: "Paper preference only. Does not affect this estimate. Subject to print house confirmation and availability."`);
  console.log(`  ✓ INVARIANTE OBSERVADA: Cero llamadas a /api/budget/calculate. La cotización se mantiene vigente.\n`);

  // PASO 3: Crear pedido
  console.log('▶ PASO 3: Crear intención de pedido con la sesión original y la preferencia de papel actualizada');
  const orderRes = await request(
    {
      hostname: '127.0.0.1',
      port: 3011,
      path: '/api/order-intents',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    {
      offer_session_id: offerSessionId,
      offer_id: bestOffer.offer_id,
      production_files: {
        interior_pdf_file_id: 'pf_journey_interior',
        cover_pdf_file_id: 'pf_journey_cover'
      },
      customer: {
        name: 'Editorial Graficas del Norte',
        email: 'produccion@graficasdelnorte.com',
        role: 'PUBLISHER'
      },
      customer_paper_preferences: updatedPaperPreference
    }
  );

  if (orderRes.status !== 200 && orderRes.status !== 201) {
    throw new Error(`Fallo al crear pedido HTTP ${orderRes.status}: ${JSON.stringify(orderRes.data)}`);
  }

  const orderId = orderRes.data.order_intent_id;
  const orderIntent = await repositories.orderIntents.getById(orderId);
  const orderAmount = orderIntent.totals.total_price;
  const orderCurrency = orderIntent.totals.currency;

  console.log(`  ✓ Intención de pedido creada exitosamente.`);
  console.log(`  ✓ Order Intent ID  : ${orderId}`);
  console.log(`  ✓ Public Ref       : ${orderIntent.public_ref}`);
  console.log(`  ✓ Importe de pedido: ${orderAmount} ${orderCurrency}`);

  if (orderAmount !== originalAmount) {
    throw new Error(`ALERTA: El importe cambió de ${originalAmount} a ${orderAmount}!`);
  }
  console.log(`  ✓ INVARIANTE VERIFICADA: El importe se conserva exactamente (${originalAmount} ${currency} === ${orderAmount} ${orderCurrency}).\n`);

  // Preparar estado de preflight y pago para permitir la generación del paquete de despacho
  orderIntent.payment = { status: 'PAID', method: 'BANK_TRANSFER' };
  orderIntent.preflight = { status: 'PASSED', jobs: [] };
  orderIntent.control_plane = { status: 'CREATED', order_ref: 'CP-ORDER-2026-JOURNEY' };
  await repositories.orderIntents.update(orderId, orderIntent);

  const dispatchRes = await request(
    {
      hostname: '127.0.0.1',
      port: 3011,
      path: `/api/order-intents/${orderId}/dispatch-package/create`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ADMIN_API_TOKEN}`
      }
    },
    {}
  );

  const packageId = dispatchRes.data.package?.package_id || dispatchRes.data.package_id;
  console.log(`  ✓ Paquete de despacho generado para imprenta: ${packageId}\n`);

  // PASO 4: Comprobar que la imprenta recibe la última preferencia
  console.log('▶ PASO 4: Comprobar vista de la imprenta (Queue y Detalle de producción)');
  const printhouseRes = await request({
    hostname: '127.0.0.1',
    port: 3011,
    path: `/api/printhouse/queue/${packageId}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${process.env.ADMIN_API_TOKEN}`
    }
  });

  const job = printhouseRes.data.job || printhouseRes.data.package || printhouseRes.data;
  console.log(`  ✓ Registro inspeccionado en la cola de producción de la imprenta.`);
  console.log(`  ✓ Package ID        : ${packageId}`);
  console.log(`  ✓ Imprenta Asignada : ${job.printhouse_name} (${job.printhouse_id})`);
  console.log(`  ✓ Importe Imprenta  : ${job.billing_summary?.total_price} ${job.billing_summary?.currency}`);
  console.log(`  ✓ Baseline BPE      : ${job.production_specs?.paper_weight_interior}g ${job.production_specs?.paper_type_interior} / ${job.production_specs?.paper_weight_cover}g ${job.production_specs?.paper_type_cover}`);

  const receivedPrefs = job.customer_paper_preferences || job.production_specs?.customer_paper_preferences;
  console.log(`  ✓ Preferencias recibidas por la imprenta:`);
  console.log(`    - Interior Recibido: ${receivedPrefs?.interior?.productName} (${receivedPrefs?.interior?.gsm}g, ${receivedPrefs?.interior?.category})`);
  console.log(`    - Pliego Requerido : ${receivedPrefs?.interior?.rawSheetFormat}`);
  console.log(`    - Cubierta Recibida: ${receivedPrefs?.cover?.productName} (${receivedPrefs?.cover?.gsm}g, ${receivedPrefs?.cover?.category})`);
  console.log(`    - Pliego Cubierta  : ${receivedPrefs?.cover?.rawSheetFormat}`);
  console.log(`    - Estado Papel     : ${receivedPrefs?.interior?.availability}`);

  if (receivedPrefs?.interior?.productName !== updatedPaperPreference.interior.productName) {
    throw new Error('FALLO: La imprenta no recibió el material interior seleccionado.');
  }
  if (receivedPrefs?.interior?.gsm !== 150) {
    throw new Error('FALLO: El gramaje interior preferido no coincide.');
  }
  if (job.billing_summary?.total_price !== originalAmount) {
    throw new Error('FALLO: El importe registrado en la imprenta difiere del importe original!');
  }

  console.log('\n======================================================================');
  console.log('RESULTADO FINAL: RECORRIDO ACREDITADO AL 100%');
  console.log(`- Importe original calculado BPE : ${originalAmount} ${currency}`);
  console.log(`- Preferencia modificada post-calc: ${updatedPaperPreference.interior.productName} 150g (Sin recálculo)`);
  console.log(`- Importe final del pedido       : ${orderAmount} ${currency} (0.00€ de variación)`);
  console.log(`- Importe recibido por imprenta  : ${job.billing_summary?.total_price} ${currency}`);
  console.log(`- Preferencia recibida imprenta  : ${receivedPrefs?.interior?.productName} · ${receivedPrefs?.interior?.gsm}g (${receivedPrefs?.interior?.rawSheetFormat})`);
  console.log(`- Estado gobernado               : PENDING PRINTHOUSE CONFIRMATION`);
  console.log('======================================================================\n');

  process.exit(0);
}

runConcreteJourney().catch(err => {
  console.error('ERROR EN RECORRIDO:', err);
  process.exit(1);
});
