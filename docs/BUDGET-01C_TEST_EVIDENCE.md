# MISIÓN BUDGET-01C — EVIDENCIAS DE PRUEBAS TÉCNICAS Y AUDITORÍA DE CI

**Fecha de Ejecución**: 27 de Octubre de 2026  
**Entorno de Pruebas**: Windows 11 / Node.js `v24.18.0` / Express 4.19 / Vite 6.4.2  
**Repositorios y Commits**:
- `PrintPricePro_BookPrice`: `bfb12839ffd244a1e73498d105e225cef8d5a827`
- `ppos-control-plane`: `cb91625f829fa5b4f4cc6b4cc11c4681115129aa`

---

## 1. Registro de Ejecución de la Suite de Certificación Adversarial

**Comando Reproducible**:
```powershell
node server/scripts/test_budget_01c_adversarial.js
```

### Log de Ejecución Completo:

```text
======================================================================
MISIÓN BUDGET-01C — CERTIFICACIÓN ADVERSARIAL Y AUDITORÍA DE CIERRE
======================================================================

▶ SECCIÓN 1: Auditoría de Integración End-to-End (BPE Real)
[BUDGET_CALCULATE_BPE_PAYLOAD] {
  "copies": 500,
  "interior_pages": 120,
  "delivery_country": "ES",
  "book_size": "A5",
  "orientation": "portrait",
  "interior_print": "4/4",
  "cover_print": "4/0",
  "paper_type_interior": "offset",
  "paper_weight_interior": 90,
  "paper_type_cover": "mc",
  "paper_weight_cover": 250,
  "paper_type_endpaper": "offset",
  "paper_weight_endpapers": 140,
  "binding_method": "flexibound",
  "finishing_options": "matt_lam"
}
[BPE_PROXY_REQUEST] session=live_bpe_cert_01 country=ES
[BUDGET_CALCULATE_BPE_RESPONSE_SUMMARY] {
  offersCount: 3,
  prices: [
    { printer_id: 'dar-2025', printer_name: 'Dar 2025', total_price: 1782.3, currency: 'EUR' },
    { printer_id: 'adv-2025', printer_name: 'Adv 2025', total_price: 1797.55, currency: 'EUR' },
    { printer_id: 'poz-2025', printer_name: 'Poz 2025', total_price: 1955.97, currency: 'EUR' }
  ]
}
[✓ PASS] [INTEGRACIÓN REAL] Test 1: Cálculo inicial conectado a BPE real marketplace
       └─ Sesión: ofs_1793110378411, Oferta seleccionada: Dar 2025 (1782.3 EUR)
[✓ PASS] [INTEGRACIÓN REAL] Test 2: Firma HMAC-SHA256 generada para la oferta seleccionada
       └─ Firma: e1c72b74861f8a5f...
[✓ PASS] [INTEGRACIÓN REAL] Test 3: Creación de Intención de Pedido con preferencia actualizada B
       └─ Intent ID: oi_1793110378512
[✓ PASS] [INTEGRACIÓN REAL] Test 4: Conservación estricta de importe original e inmutabilidad económica
       └─ Importe en Pedido: 1782.3 === 1782.3 EUR
[✓ PASS] [HÍBRIDA] Test 5: Generación de Dispatch Package con snapshot canónico para taller
       └─ Package ID: dp_1793110378031_9b010b46

▶ SECCIÓN 2: Certificación de Seguridad Adversarial
[✓ PASS] [HÍBRIDA] Test 6: Tenant spoofing vía query parameter (?tenant_id=attacker)
       └─ BFF desestima parámetros fuera de la whitelist de consulta
[✓ PASS] [HÍBRIDA] Test 7: Tenant spoofing vía HTTP Parameter Pollution (array parameters)
       └─ Parámetro contaminado ignorado por whitelist estricta
[✓ PASS] [HÍBRIDA] Test 8: Tenant spoofing vía cabecera x-tenant-id
       └─ Cabecera no autorizada ignorada en resolución de catálogo
[✓ PASS] [MOCK / ASERCIÓN] Test 9: Supresión estricta de costes, márgenes y proveedor interno
       └─ 0 campos sensibles expuestos
[✓ PASS] [HÍBRIDA] Test 10: Sanitización de respuestas de error (sin fuga de trazas internas)
       └─ HTTP 400 con mensaje de error limpio
[✓ PASS] [INTEGRACIÓN REAL] Test 11: Resistencia a Prototype Pollution (__proto__ injection)
       └─ Objeto prototipo global incontaminado
[✓ PASS] [INTEGRACIÓN REAL] Test 12: Rechazo de cadenas excesivas (>150 chars en nombre de papel)
       └─ Preferencia inválida descartada por el validador
[✓ PASS] [INTEGRACIÓN REAL] Test 13: Rechazo de gramajes fuera de rango físico (gsm: -90)
       └─ Preferencia con gramaje inválido descartada por el servidor
[✓ PASS] [INTEGRACIÓN REAL] Test 14: Normalización de categoría no canónica a "OTHER"
       └─ Categoría resultante: OTHER
[✓ PASS] [INTEGRACIÓN REAL] Test 15: Filtrado de secciones no soportadas (flyleaf/slipcase injection)
       └─ Solo las secciones permitidas (interior, cover, endpaper) son procesadas
[✓ PASS] [INTEGRACIÓN REAL] Test 16: Forzado en servidor de disponibilidad PENDING_CONFIRMATION
       └─ Estado persistido en servidor: CUSTOMER_PREFERENCE_PENDING_CONFIRMATION
[OFFER_RESOLVE_FAILED] INVALID_SIGNATURE
[✓ PASS] [INTEGRACIÓN REAL] Test 17: Detección de alteración de precio mediante verificación HMAC
       └─ Intento de compra con precio adulterado rechazado con HTTP 400

▶ SECCIÓN 3: Certificación Funcional y Protocolo de 3 Estados
[✓ PASS] [INTEGRACIÓN REAL] Test 18: Protocolo: A → B sin recalcular (Sustitución)
       └─ Preferencia sustituida con éxito conservando importe original
[✓ PASS] [INTEGRACIÓN REAL] Test 19: Protocolo: A → null sin recalcular (Eliminación explícita)
       └─ Preferencia eliminada limpiamente, importe idéntico
[✓ PASS] [INTEGRACIÓN REAL] Test 20: Protocolo: A → Campo omitido (Conservación de preferencia previa)
       └─ Preferencia A conservada intacta desde la sesión de cálculo
[✓ PASS] [INTEGRACIÓN REAL] Test 21: Preferencias simultáneas e independientes para Interior y Cubierta
       └─ Ambas secciones registradas correctamente en snapshot
[✓ PASS] [INTEGRACIÓN REAL] Test 22: Actualización parcial: Interior actualizado a B, Cubierta conservada
       └─ Interior actualizado a Creator Silk, Cubierta conservada en Trucard Gloss
[✗ FAIL] [INTEGRACIÓN REAL] Test 23: Eliminación parcial: Interior eliminado (null), Cubierta conservada
       └─ HALLAZGO: Re-resolución en buildCanonicalOrderSnapshot resucita interior previo de session.normalized_specs
[✓ PASS] [INTEGRACIÓN REAL] Test 24: Persistencia consistente de intención ante reintentos de cliente
       └─ Intención creada con idempotencia de sesión
[✓ PASS] [HÍBRIDA] Test 25: Comportamiento Fail-Closed (HTTP 502 sin datos sintéticos inventados)
       └─ Respuesta obtenida: HTTP 502 (nunca expone datos falsos)
[✓ PASS] [HÍBRIDA] Test 26: Inspección de cola de imprenta: preferencia visible y baseline intacto
       └─ Importe imprenta: 1782.3 EUR | Preferencia: Creator Silk

======================================================================
RESUMEN DE RESULTADOS DE CERTIFICACIÓN BUDGET-01C
======================================================================
Total Aserciones Ejecutadas: 26
  ✓ Superadas: 25
  ✗ Fallidas:  1

Desglose por Rigor de Ejecución:
  • Integración Real (Conexión a live BPE / Base de Datos real): 18
  • Híbridas (Servidor Express real local con capa de persistencia interna): 7
  • Mock / Aserción unitaria de aislamiento: 1
======================================================================
```

---

## 2. Clasificación Transparente de Pruebas

Para garantizar la honestidad técnica estricta requerida por el proyecto:

1. **Integración Real (18 pruebas)**:
   - Servicios Críticos Involucrados: Endpoint en vivo de BPE (`https://bpe.printprice.pro/api/marketplace/offers`), firmas criptográficas HMAC computadas con clave secreta y verificadas con `timingSafeEqual`, ciclo de vida real de sesiones y pedidos en almacén JSON persistido.
   - **No se simuló el motor BPE** en ninguna de estas 18 pruebas; todas las tarifas (1.782,30 € para Dar 2025, 1.797,55 € para Adv 2025, 1.955,97 € para Poz 2025) fueron resueltas por los algoritmos del backend en vivo.

2. **Híbridas (7 pruebas)**:
   - Se ejecutaron peticiones HTTP sobre el servidor real de Budget (`http://127.0.0.1:3012`) utilizando Express y los adaptadores de persistencia del repositorio. La conexión con Control Plane fue probada contra el puerto 8081; al no estar levantado localmente, se validó el comportamiento fail-closed real (HTTP 502 sin fugas de datos).

3. **Mock / Aserción Unitaria (1 prueba)**:
   - Test 9 empleó el fixture `RAW_SUPPLIER_RECORD` para verificar la función de proyección de campos, acreditando que claves privadas como `wholesale_price` o `supplier_cost_margin` nunca trascienden al objeto público.

---

## 3. Verificación de Compilación y TypeScript

### A. TypeScript en Budget App
**Comando**:
```powershell
npx tsc --noEmit
```
**Resultado**:
```text
Exit code: 0
Diagnósticos / Errores: 0 errores detectados.
```

### B. Build de Producción en Budget App
**Comando**:
```powershell
npm run build
```
**Resultado**:
```text
vite v6.4.2 building for production...
transforming...
✓ 2311 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                              1.22 kB │ gzip:   0.64 kB
dist/assets/pdf.worker.min-iDqQPrd3.mjs  1,232.30 kB
dist/assets/index-Favs5W1m.css              48.94 kB │ gzip:   8.85 kB
dist/assets/vendor-r8u9V8ny.js             228.32 kB │ gzip:  66.96 kB
dist/assets/index-D1yOMv6V.js              237.29 kB │ gzip:  52.78 kB
dist/assets/pdfjs-vendor-B8GwQ_c3.js       517.83 kB │ gzip: 156.67 kB
✓ built in 5.74s
Exit code: 0
```

### C. Validación de Sintaxis en Control Plane
**Comando**:
```powershell
node -c src/api/routes/marketplacePublic.js
```
**Resultado**:
```text
Exit code: 0
Validación de sintaxis ECMAScript: Correcta, sin errores de parseo.
```

---

## 4. Auditoría de Checks de Integración Continua (GitHub Actions)

### Hallazgo: Cero Checks en PR #6 y PR #1

1. **Control Plane ([PR #6](https://github.com/PrintPriceOS/ppos-control-plane/pull/6))**:
   - **Consulta a GitHub API**: `gh pr checks 6 --repo PrintPriceOS/ppos-control-plane` reportó:
     `no checks reported on the 'feat/budget-01-marketplace-paper-catalog' branch`.
   - **Causa Raíz Verificada**: El archivo de configuración de CI (`.github/workflows/ci.yml`) define:
     ```yaml
     pull_request:
       branches: [ main, v1.9.0, phase-10-intelligence-layer, phase-39.2-tenant-management-console ]
     ```
     La rama base asignada a PR #6 es `feat/paper-supplier-hub-completion`. Dado que esta rama no está incluida en la lista de ramas objetivo de `ci.yml`, el motor de GitHub Actions **ignora el PR por configuración**.

2. **Budget App ([PR #1](https://github.com/PrintPriceOS/PrintPricePro_BookPrice/pull/1))**:
   - **Consulta a GitHub API**: `gh pr checks 1 --repo PrintPriceOS/PrintPricePro_BookPrice` reportó:
     `no checks reported on the 'feat/budget-01-visual-identity-and-paper-selector' branch`.
   - **Causa Raíz Verificada**: El repositorio `PrintPricePro_BookPrice` no contiene el directorio `.github/workflows/`. Al no existir definiciones de flujos de CI en el repositorio, no se ejecutan runners automatizados en GitHub.

---

## 5. Evidencias de Interfaz de Usuario y Responsividad

Se validó el comportamiento visual sin desbordamiento horizontal (`overflow-x: hidden`) en las siguientes resoluciones mediante las capturas públicas alojadas en el repositorio:

| Dispositivo / Vista | Ancho | Enlace a Evidencia Remota | Elementos Clave Verificados |
| :--- | :---: | :--- | :--- |
| **Desktop Monolith** | 1920px | [Ver Captura](https://raw.githubusercontent.com/PrintPriceOS/PrintPricePro_BookPrice/feat/budget-01-visual-identity-and-paper-selector/docs/evidence/budget_01_desktop_main.png) | Header corporativo, acento rojo `#dc0000`, tipografía técnica. |
| **Selector Avanzado** | 1280px | [Ver Captura](https://raw.githubusercontent.com/PrintPriceOS/PrintPricePro_BookPrice/feat/budget-01-visual-identity-and-paper-selector/docs/evidence/budget_01_advanced_selector.png) | Selector agrupado por producto, dropdown de variantes y aviso regulatorio obligatorio. |
| **Resumen Comercial** | 1280px | [Ver Captura](https://raw.githubusercontent.com/PrintPriceOS/PrintPricePro_BookPrice/feat/budget-01-visual-identity-and-paper-selector/docs/evidence/budget_01_configuration_summary.png) | Especificación base económica (90g offset) vs preferencia del cliente (Amber Graphic 120g). |
| **Taller / Imprenta** | 1440px | [Ver Captura](https://raw.githubusercontent.com/PrintPriceOS/PrintPricePro_BookPrice/feat/budget-01-visual-identity-and-paper-selector/docs/evidence/budget_01_printhouse_preference.png) | Badge ámbar pulsante `PENDING PRINTHOUSE CONFIRMATION`, advertencia antes de corte. |
| **Mobile Standard** | 390px | [Ver Captura](https://raw.githubusercontent.com/PrintPriceOS/PrintPricePro_BookPrice/feat/budget-01-visual-identity-and-paper-selector/docs/evidence/budget_01_mobile_390.png) | Drawer inferior sticky, sin desbordamiento en iPhone 14. |
| **Mobile Android** | 360px | [Ver Captura](https://raw.githubusercontent.com/PrintPriceOS/PrintPricePro_BookPrice/feat/budget-01-visual-identity-and-paper-selector/docs/evidence/budget_01_mobile_360.png) | Controles táctiles accesibles (mínimo 44px de altura). |
| **Mobile Compact** | 320px | [Ver Captura](https://raw.githubusercontent.com/PrintPriceOS/PrintPricePro_BookPrice/feat/budget-01-visual-identity-and-paper-selector/docs/evidence/budget_01_mobile_320.png) | Wrap de etiquetas técnicas sin solapamiento de textos en pantallas estrechas. |
