# MISIÓN BUDGET-01C — INFORME DE PREPARACIÓN PARA FUSIÓN (MERGE READINESS)

**Dictamen de Preparación**: `CONDICIONADO A PARCHE H-01`  
**Estado de Fusión**: **BLOQUEADO (NO MERGE / NO DEPLOY)**  
**Repositorios Involucrados**:
- `PrintPriceOS/PrintPricePro_BookPrice` ([PR #1](https://github.com/PrintPriceOS/PrintPricePro_BookPrice/pull/1))
- `PrintPriceOS/ppos-control-plane` ([PR #6](https://github.com/PrintPriceOS/ppos-control-plane/pull/6))

---

## 1. Resumen de Preparación para Fusión

La auditoría técnica y certificación adversarial conjunta de **BUDGET-01C** ha validado satisfactoriamente los pilares arquitectónicos esenciales:
- **Invarianza Económica**: Cero desviación de precio en cotizaciones y pedidos (1.782,30 € garantizados).
- **Aislamiento de Tenants**: Doble barrera (whitelist en BFF + tenant autoritativo en servidor Control Plane).
- **Neutralidad de Stock**: Ausencia total de falsas confirmaciones de existencias.
- **Resistencia Criptográfica**: Verificación HMAC-SHA256 íntegra ante cualquier intento de alteración de precios o especificaciones.

No obstante, **no se autoriza la fusión inmediata** en `main` hasta aplicar la remediación del hallazgo **H-01**.

---

## 2. Lista de Verificación Pre-Fusión (Pre-Merge Checklist)

| Criterio | Estado | Detalle |
| :--- | :---: | :--- |
| **Separación de especificación base y preferencia** | **CUMPLIDO** | BPE calcula únicamente sobre la base técnica (90g offset, mc 250g). |
| **Aislamiento público de materiales** | **CUMPLIDO** | Ni `tenant_id` en query ni `x-tenant-id` en cabeceras alteran el tenant del catálogo. |
| **Supresión de datos sensibles y costes** | **CUMPLIDO** | Ni precios mayoristas ni IDs de proveedor se transmiten al cliente. |
| **Neutralidad física de disponibilidad** | **CUMPLIDO** | `offerStatus` ausente o activo siempre requiere confirmación de imprenta. |
| **Integridad de firmas HMAC** | **CUMPLIDO** | Tampering de precio, moneda o specs_hash produce rechazo HTTP 400. |
| **Protocolo 3-State: Sustitución (A → B)** | **CUMPLIDO** | Sustitución completa comprobada en pedido y despacho. |
| **Protocolo 3-State: Eliminación Total (`null`)** | **CUMPLIDO** | `customer_paper_preferences: null` borra limpiamente la preferencia. |
| **Protocolo 3-State: Conservación (Omitido)** | **CUMPLIDO** | La omisión de campo conserva la preferencia previa de la sesión. |
| **Protocolo 3-State: Eliminación Parcial Asimétrica** | **PENDIENTE (H-01)** | Borrar interior con `null` omitiendo cubierta resucita el interior en snapshot. |
| **Compilación TypeScript limpia (0 errores)** | **CUMPLIDO** | `npx tsc --noEmit` exitoso. |
| **Build de producción Vite** | **CUMPLIDO** | `npm run build` completado en 5.74s. |
| **Checks de GitHub Actions en verde** | **PENDIENTE CONFIG.** | Ajustar triggers en `ci.yml` para rama `feat/paper-supplier-hub-completion`. |

---

## 3. Plan de Acción Quirúrgico para Alcanzar `BUDGET-01C_PASS`

Para certificar el pase definitivo y levantar la condición de bloqueo:

### Paso 1: Aplicar Parche H-01 en `server/server.js` (Budget App)
En [`server/server.js`](file:///c:/Users/KIKE/Downloads/PrintPricePro_BookPrice-feature-adversarial-node-v5.2/server/server.js):
1. **Líneas 1106 y 1109**: Modificar `buildCanonicalOrderSnapshot` para que respete `orderIntent.customer_paper_preferences` ya resuelto y no vuelva a evaluar contra `session.normalized_specs`:
   ```javascript
   customer_paper_preferences: orderIntent.customer_paper_preferences !== undefined 
       ? orderIntent.customer_paper_preferences 
       : resolveCustomerPaperPreferences(specs.customer_paper_preferences, session.normalized_specs?.customer_paper_preferences)
   ```
2. **Línea 3109**: En `POST /api/order-intents`, evitar que el snapshot re-sobreescriba la intención:
   ```javascript
   intentRecord.customer_paper_preferences = intentRecord.customer_paper_preferences !== undefined
       ? intentRecord.customer_paper_preferences
       : snapshot.customer_paper_preferences;
   ```

### Paso 2: Re-ejecutar Suite de Certificación
Ejecutar:
```powershell
node server/scripts/test_budget_01c_adversarial.js
```
Verificar el resultado: `26 de 26 aserciones superadas (100% PASS)`.

### Paso 3: Configuración de CI en Repositorios Remotos
1. En `ppos-control-plane`, si se requiere check formal de GitHub antes del merge, agregar la rama base `feat/paper-supplier-hub-completion` a la sección `pull_request.branches` de `.github/workflows/ci.yml`.
2. En `PrintPricePro_BookPrice`, crear `.github/workflows/ci.yml` con validación de `npm run build` y `npx tsc --noEmit`.

---

## 4. Salvaguardas y Restricciones Operativas

- **PROHIBIDO FUSIONAR**: Ni [PR #1](https://github.com/PrintPriceOS/PrintPricePro_BookPrice/pull/1) ni [PR #6](https://github.com/PrintPriceOS/ppos-control-plane/pull/6) deben fusionarse en `main` hasta recibir la autorización expresa del Stakeholder con el veredicto definitivo.
- **PROHIBIDO DESPLEGAR**: Ningún artefacto de esta certificación debe desplegarse en entornos de staging ni producción.
