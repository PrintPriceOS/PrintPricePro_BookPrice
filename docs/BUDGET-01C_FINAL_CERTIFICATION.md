# MISIÓN BUDGET-01C — DICTAMEN DE CERTIFICACIÓN FINAL CONJUNTA

**Proyecto**: PrintPrice OS  
**Componentes**: PrintPricePro_BookPrice (Budget App) & ppos-control-plane (Control Plane)  
**Modalidad**: Auditoría Técnica, Pruebas Adversariales y Verificación de Integridad  
**Fecha de Certificación**: 27 de Octubre de 2026  
**Restricción Operativa**: **NO MERGE / NO DEPLOY**  

---

## 1. Veredicto de la Certificación

> ### ⚠️ VEREDICTO: `BUDGET-01C_CONDITIONAL`
> 
> **Resumen Ejecutivo**:  
> La implementación informativa de catálogo y preferencias de papel alcanza un nivel sobresaliente de robustez en aislamiento entre tenants, protección contra ataques adversariales, invariancia económica estricta (0,00 € de alteración en BPE) y neutralidad de disponibilidad física. Se han acreditado satisfactoriamente **25 de 26 aserciones de prueba** (18 de integración real contra el marketplace BPE en vivo).
>
> Se emite veredicto **CONDICIONADO** debido a la detección de un defecto en la re-resolución multi-etapa del snapshot canónico: si el cliente solicita una eliminación parcial de preferencia (`{ interior: null }` omitiendo la clave `cover`), la función `buildCanonicalOrderSnapshot` vuelve a pasar el objeto ya resuelto por `resolveCustomerPaperPreferences` contra las especificaciones iniciales de la sesión, interpretando la ausencia de la clave borrada como "campo omitido" y resucitando el material previo en el snapshot.  
> La eliminación global (`customer_paper_preferences: null`), la sustitución completa (A → B) y la omisión simple funcionan al 100%. Se proporciona la corrección quirúrgica de 2 líneas requerida antes de autorizar el merge.

---

## 2. Commits de Referencia Auditados

| Repositorio | Rama | Commit SHA de Referencia | Pull Request | Estado de Fusión |
| :--- | :--- | :--- | :--- | :--- |
| **PrintPricePro_BookPrice** | `feat/budget-01-visual-identity-and-paper-selector` | `bfb12839ffd244a1e73498d105e225cef8d5a827` | [PR #1](https://github.com/PrintPriceOS/PrintPricePro_BookPrice/pull/1) | **ABIERTO (Sin Fusionar)** |
| **ppos-control-plane** | `feat/budget-01-marketplace-paper-catalog` | `cb91625f829fa5b4f4cc6b4cc11c4681115129aa` | [PR #6](https://github.com/PrintPriceOS/ppos-control-plane/pull/6) | **ABIERTO (Sin Fusionar)** |

---

## 3. Evaluación de los Cuatro Puntos Críticos de Validación

### Punto 1: Disponibilidad Real del Papel (Stock No Confirmado)
- **Criterio**: Garantizar que ningún componente visual ni de backend presente un `offerStatus === 'ACTIVE'` como stock físico garantizado o reservado de fábrica sin verificación de la imprenta.
- **Resultado de Auditoría**: **CERTIFICADO (PASS)**.
  - En Control Plane ([`src/api/routes/marketplacePublic.js`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/src/api/routes/marketplacePublic.js)), los ítems sanitizados fijan `stockConfirmationRequired: true` y `availabilityStatus: item.offerStatus === 'ACTIVE' ? 'ACTIVE' : 'PENDING_PRINTHOUSE_CONFIRMATION'`.
  - En el servidor Budget ([`server/server.js`](file:///c:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/server/server.js)), `sanitizePaperSectionPreference` sobreescribe cualquier intento del cliente de declararse confirmado, fijando de forma inmutable:
    ```javascript
    availability: 'CUSTOMER_PREFERENCE_PENDING_CONFIRMATION',
    status: 'CUSTOMER_PREFERENCE_PENDING_CONFIRMATION'
    ```
  - En la interfaz ([`components/AdvancedPaperSelector.tsx`](file:///c:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/components/AdvancedPaperSelector.tsx) y [`components/PrinthouseJobDetail.tsx`](file:///c:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/components/PrinthouseJobDetail.tsx)), se presentan de manera destacada los avisos regulatorios:
    > *"Paper preference only. Does not affect this estimate. Subject to print house confirmation and availability."*  
    > *"CUSTOMER PREFERENCE (UNCONFIRMED BY PRINTER)"*  
    > Badge en imprenta: `PENDING PRINTHOUSE CONFIRMATION`.

---

### Punto 2: Persistencia y Consistencia del Pedido
- **Criterio**: Verificar que el presupuesto firmado, el snapshot canónico, la intención de pedido y el paquete de despacho mantienen el mismo estado de preferencias ante reintentos y solicitudes repetidas.
- **Resultado de Auditoría**: **PARCIALMENTE CERTIFICADO (CONDICIONADO)**.
  - **Idempotencia y Reintentos**: Acreditado. Reintentar la creación de una orden con la misma sesión e intención conserva el mismo identificador, importe y especificaciones.
  - **Inmutabilidad Económica**: Acreditado. El importe exacto (1.782,30 €) se mantiene idéntico entre cálculo, orden, snapshot y paquete de despacho.
  - **Hallazgo Bloqueante (H-01)**: En la eliminación parcial asimétrica (`{ interior: null }` sin clave `cover`), la re-evaluación en `buildCanonicalOrderSnapshot` (`server/server.js:1106`) resucita el interior desde la sesión previa. Véase Sección 5 para el análisis detallado.

---

### Punto 3: Seguridad Adversarial del Catálogo Público
- **Criterio**: Comprobar resistencia contra manipulación de tenants, inyección de parámetros, fuga de datos mayoristas y envenenamiento de objetos.
- **Resultado de Auditoría**: **CERTIFICADO (PASS)**.
  - **Aislamiento de Tenant**: Defensa en profundidad de 2 capas:
    1. *Capa 1 (Budget BFF)*: Whitelist estricta con `URLSearchParams`. Parámetros `tenant_id`, `supplier_id` o arrays contaminados son descartados antes de cursar la petición.
    2. *Capa 2 (Control Plane)*: `PUBLIC_CATALOG_TENANT_ID` forzado en servidor (`ppos-production`). Eliminación explícita de `queryParams.tenant_id`. Cabecera `x-tenant-id` ignorada.
  - **Fuga de Datos Sensibles**: 0 campos expuestos. Precios de compra mayorista (`wholesale_price`, `price_amount`), márgenes internos (`supplier_cost_margin`) e identificadores de proveedor son completamente suprimidos.
  - **Seguridad en Entrada**: Neutralización comprobada de Prototype Pollution (`__proto__`), rechazo de cadenas >150 caracteres, gramajes fuera de rango físico y normalización de categorías no canónicas a `OTHER`.
  - **Integridad HMAC**: Detección inmediata de alteración fraudulenta de precio (ej. 1.782,30 € → 10,00 €), specs hash, moneda o proveedor, respondiendo con HTTP 400 `INVALID_OFFER_SIGNATURE`.

---

### Punto 4: Transparencia de CI y Rigor de Pruebas
- **Criterio**: Clasificación explícita de pruebas (sin disfrazar mocks como integración real) y diagnóstico de los checks de GitHub Actions.
- **Resultado de Auditoría**: **CERTIFICADO (PASS)**.
  - **Desglose de la Suite de Certificación (26 Aserciones)**:
    - **18 pruebas de Integración Real**: Ejecutadas contra el motor BPE live (`https://bpe.printprice.pro/api/marketplace/offers`), generando firmas HMAC reales y validando persistencia.
    - **7 pruebas Híbridas**: Ejecutadas contra el servidor local Express con persistencia y emulación de capa de red.
    - **1 prueba de Mock**: Validación estricta de stripping de atributos mayoristas mediante fixture.
  - **Diagnóstico de GitHub Actions (Cero Checks en PR #6 y PR #1)**:
    - **Control Plane PR #6**: El archivo [`.github/workflows/ci.yml`](file:///c:/Users/KIKE/Downloads/ppos-control-plane-phase-10-intelligence-layer/.github/workflows/ci.yml#L6-L7) tiene configurado el filtro:
      ```yaml
      pull_request:
        branches: [ main, v1.9.0, phase-10-intelligence-layer, phase-39.2-tenant-management-console ]
      ```
      Dado que la rama base de PR #6 es `feat/paper-supplier-hub-completion`, GitHub Actions **no activa el workflow por diseño de la regla de ramas**.
    - **Budget PR #1**: El repositorio `PrintPricePro_BookPrice` **no dispone de la carpeta `.github/workflows/`**, por lo que no existen runners configurados en el repositorio.

---

## 4. Matriz Resumida de Aserciones

| # | Área Evaluada | Tipo de Prueba | Resultado | Observaciones |
| :-: | :--- | :--- | :-: | :--- |
| **01** | Cálculo BPE Marketplace Real | Integración Real | **PASS** | Sesión y cotización en vivo (1.782,30 €) |
| **02** | Generación de Firma HMAC-SHA256 | Integración Real | **PASS** | Hash canónico inmutable de 64 caracteres |
| **03** | Creación de Intención de Pedido con Preferencia B | Integración Real | **PASS** | Material Creator Silk 150g registrado |
| **04** | Conservación de Importe y Paridad de Cálculo | Integración Real | **PASS** | Importe en pedido idéntico al céntimo (1.782,30 €) |
| **05** | Emisión de Dispatch Package con Snapshot | Híbrida | **PASS** | Identificador `dp_*` y specs consolidadas |
| **06** | Tenant Spoofing vía Query Parameter | Híbrida | **PASS** | Whitelist BFF descarta `tenant_id` |
| **07** | Parameter Pollution (Array Parameters) | Híbrida | **PASS** | Whitelist BFF descarta `tenant_id[]` |
| **08** | Tenant Spoofing vía Cabecera `x-tenant-id` | Híbrida | **PASS** | Servidor Control Plane fuerza tenant público |
| **09** | Supresión de Datos Mayoristas y Márgenes | Mock / Aserción | **PASS** | 0 campos sensibles expuestos |
| **10** | Sanitización de Errores (Sin fugas de traza) | Híbrida | **PASS** | HTTP 400 sin stack trace ni detalles de BD |
| **11** | Resistencia a Prototype Pollution (`__proto__`) | Integración Real | **PASS** | Objeto prototipo global incontaminado |
| **12** | Rechazo de Cadenas Excesivas (>150 caracteres) | Integración Real | **PASS** | Preferencia descartada por longitud |
| **13** | Rechazo de Gramajes Negativos (`gsm: -90`) | Integración Real | **PASS** | Descartado por validación física de límites |
| **14** | Normalización de Categorías Desconocidas | Integración Real | **PASS** | Mapeado automático a `OTHER` |
| **15** | Supresión de Secciones No Soportadas | Integración Real | **PASS** | `flyleaf` / `slipcase` ignorados |
| **16** | Forzado en Servidor de Disponibilidad Pendiente | Integración Real | **PASS** | Estado `CUSTOMER_PREFERENCE_PENDING_CONFIRMATION` |
| **17** | Detección de Alteración Fraudulenta de Precio | Integración Real | **PASS** | HMAC detecta adulteración (HTTP 400) |
| **18** | Protocolo 3-State: A → B (Sustitución) | Integración Real | **PASS** | Sustituido por B conservando importe |
| **19** | Protocolo 3-State: A → `null` (Eliminación Total) | Integración Real | **PASS** | Preferencia eliminada, baseline 90g intacto |
| **20** | Protocolo 3-State: A → Omitido (Conservación) | Integración Real | **PASS** | Preferencia A conservada intacta |
| **21** | Preferencias Independientes (Interior y Cubierta) | Integración Real | **PASS** | Ambas secciones registradas en snapshot |
| **22** | Actualización Parcial (Interior a B, Cubierta omitida) | Integración Real | **PASS** | Interior = B, Cubierta = A previa |
| **23** | Eliminación Parcial Asimétrica (`{ interior: null }`) | Integración Real | **FAIL (H-01)** | Re-resolución en snapshot resucita interior previo |
| **24** | Idempotencia y Reintentos de Pedido | Integración Real | **PASS** | Persistencia consistente sin duplicaciones |
| **25** | Comportamiento Fail-Closed de Catálogo | Híbrida | **PASS** | HTTP 502 sin sintetizar datos falsos |
| **26** | Inspección de Cola de Imprenta | Híbrida | **PASS** | Preferencia visible con badge pendiente |

---

## 5. Hallazgo H-01: Re-resolución Redundante en Snapshot Canónico

### Descripción de la Causa Raíz
En [`server/server.js`](file:///c:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/server/server.js#L3100-L3109), al crearse la intención de pedido (`POST /api/order-intents`), `intentRecord.customer_paper_preferences` se resuelve de forma autoritativa mediante:
```javascript
customer_paper_preferences: resolveCustomerPaperPreferences(
    req.body.customer_paper_preferences,
    session.normalized_specs?.customer_paper_preferences
)
```
Si el cliente envía `{ interior: null }` (eliminación del interior conservando cubierta), `intentRecord.customer_paper_preferences` queda correctamente resuelto como `{ cover: { ... } }`.

Sin embargo, a continuación se invoca `buildCanonicalOrderSnapshot`, el cual en la línea 1106 ejecuta:
```javascript
customer_paper_preferences: resolveCustomerPaperPreferences(
    orderIntent.customer_paper_preferences,
    specs.customer_paper_preferences || session.normalized_specs?.customer_paper_preferences
)
```
Al recibir como `incoming` el objeto ya resuelto `{ cover: { ... } }`, la clave `interior` es `undefined`. La función `resolveCustomerPaperPreferences` interpreta `undefined` como "campo omitido: conservar valor previo" y busca en `previous` (`session.normalized_specs`), **resucitando el material interior previo** en el snapshot canónico. Posteriormente, en la línea 3109, el valor del snapshot sobrescribe a `intentRecord`.

### Parche Quirúrgico Recomendado
Para solucionar H-01 sin modificar la arquitectura:
```diff
--- a/server/server.js
+++ b/server/server.js
@@ -1103,4 +1103,4 @@ const buildCanonicalOrderSnapshot = (orderIntent, session, resolvedOffer, interi
             paper_type_cover: specs.paper_type_cover || 'mc',
             paper_weight_cover: normalizeNum(specs.paper_weight_cover),
             finishing_options: specs.finishing_options || '',
             delivery_country: specs.delivery_country || '',
-            customer_paper_preferences: resolveCustomerPaperPreferences(orderIntent.customer_paper_preferences, specs.customer_paper_preferences || session.normalized_specs?.customer_paper_preferences)
+            customer_paper_preferences: orderIntent.customer_paper_preferences !== undefined ? orderIntent.customer_paper_preferences : resolveCustomerPaperPreferences(specs.customer_paper_preferences, session.normalized_specs?.customer_paper_preferences)
         },
 
-        customer_paper_preferences: resolveCustomerPaperPreferences(orderIntent.customer_paper_preferences, specs.customer_paper_preferences || session.normalized_specs?.customer_paper_preferences),
+        customer_paper_preferences: orderIntent.customer_paper_preferences !== undefined ? orderIntent.customer_paper_preferences : resolveCustomerPaperPreferences(specs.customer_paper_preferences, session.normalized_specs?.customer_paper_preferences),
@@ -3106,4 +3106,4 @@ app.post('/api/order-intents', async (req, res) => {
     // Build Canonical Snapshot
     const snapshot = buildCanonicalOrderSnapshot(intentRecord, session, resolvedOffer, interior, cover);
     intentRecord.payload = { order_snapshot: snapshot };
-    intentRecord.customer_paper_preferences = snapshot.customer_paper_preferences || intentRecord.customer_paper_preferences;
+    intentRecord.customer_paper_preferences = intentRecord.customer_paper_preferences !== undefined ? intentRecord.customer_paper_preferences : snapshot.customer_paper_preferences;
```

---

## 6. Conclusión de Certificación

Se certifica que la arquitectura, el aislamiento de tenants, la neutralidad comercial y el diseño visual de **BUDGET-01** cumplen con los requerimientos técnicos y de seguridad del sistema PrintPrice OS.

La aprobación final para fusión queda **CONDICIONADA** a la aplicación del ajuste menor H-01 en `server/server.js`. Se mantiene la instrucción estricta: **NO MERGE / NO DEPLOY**.
