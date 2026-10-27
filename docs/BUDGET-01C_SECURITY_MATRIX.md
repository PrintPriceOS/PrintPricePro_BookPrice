# MISIÓN BUDGET-01C — MATRIZ DE SEGURIDAD ADVERSARIAL

**Repositorios**: `PrintPricePro_BookPrice` & `ppos-control-plane`  
**Commits Auditados**: `bfb12839ffd244a1e73498d105e225cef8d5a827` / `cb91625f829fa5b4f4cc6b4cc11c4681115129aa`  
**Fecha de Emisión**: 27 de Octubre de 2026  
**Clasificación de Riesgo**: Infraestructura Comercial y Catálogo Público  

---

## 1. Superficie de Ataque y Límites de Confianza

El ecosistema evaluado presenta tres fronteras de confianza críticas:
1. **Cliente Público (Navegador) → Budget BFF**: Entorno no confiable. Cualquier parámetro, cabecera o payload JSON puede ser manipulado o envenenado por un atacante.
2. **Budget BFF → Control Plane (`/api/marketplace/paper-catalog`)**: Pasarela de catálogo. Debe impedir que un usuario del BFF utilice credenciales del sistema para saltar de tenant o acceder a tarifas mayoristas de imprenta.
3. **Budget BFF → Motor BPE (`https://bpe.printprice.pro`) & Reglas Comerciales**: El cálculo económico debe ser soberano y resistente a manipulaciones de precios firmados o preferencias falsificadas.

```
[ Navegador / Atacante ]
         │ (HTTP no confiable: query spoofing, headers, payloads maliciosos)
         ▼
[ Budget BFF (server.js:3012) ] ── (Whitelist estricta URLSearchParams)
         │                                   │
         │ (Firma HMAC, BPE Payload)         ▼
         ▼                          [ Control Plane (marketplacePublic.js) ]
[ BPE Engine / Marketplace ]                 │
         │                                   ▼
         │ (Firma SHA256 inmutable) [ Base de Datos Master Paper ]
         ▼                                   │
[ Offer Session (Vault) ]                    ▼
         │                          (Sanitizado: Sin costes mayoristas,
         ▼                           Sin proveedor, Disponibilidad Pendiente)
[ Order Intent & Dispatch Package ]
```

---

## 2. Matriz Detallada de Vectores de Ataque y Mitigaciones

| ID | Vector de Ataque | Mecanismo de Explotación | Severidad | Mitigación Implementada | Evidencia / Test | Estado |
| :-: | :--- | :--- | :-: | :--- | :--- | :-: |
| **SEC-01** | **Tenant Spoofing vía Query** | Inyección de `?tenant_id=attacker` o `?tenantId=attacker` para acceder al catálogo privado de otra imprenta. | **CRÍTICA** | **Defensa en Profundidad (2 Capas)**:<br>1. BFF usa `URLSearchParams` con whitelist estricta (`q`, `category`, `finish`, `gsm`, `limit`, `offset`). `tenant_id` es descartado.<br>2. Control Plane fija autoritativamente `PUBLIC_CATALOG_TENANT_ID = 'ppos-production'` y elimina `queryParams.tenant_id`. | Test 6 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-02** | **HTTP Parameter Pollution** | Envío de parámetros repetidos como arrays (`?tenant_id[]=t1&tenant_id[]=t2`). | **ALTA** | La whitelist del BFF descarta arrays de parámetros no declarados; Control Plane no indexa arrays para identidad de tenant. | Test 7 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-03** | **Tenant Spoofing vía Headers** | Inyección de cabeceras `x-tenant-id` o `X-Tenant-ID` en la petición pública. | **CRÍTICA** | El endpoint público en Control Plane no consulta la cabecera `x-tenant-id`; el ámbito de tenant está fijado estrictamente en servidor. | Test 8 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-04** | **Fuga de Precios Mayoristas** | Intento de extracción de `wholesale_price`, `price_amount`, `internal_cost` o tarifas base por tonelada. | **ALTA** | Mapeo explícito en Control Plane que excluye cualquier propiedad de coste o compra mayorista. | Test 9 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-05** | **Fuga de Identidad de Proveedor** | Exposición de `supplier_id`, `supplier_name`, o márgenes pactados (`supplier_cost_margin`). | **ALTA** | Propiedades de proveedor completamente eliminadas del payload público; solo se expone la marca comercial (`brand`) y fabricante (`manufacturer`). | Test 9 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-06** | **Fuga de Información en Errores** | Provocación de errores 400/500/502 para obtener stack traces o nombres de tablas SQL. | **MEDIA** | Respuestas de error estandarizadas (`CATALOG_UNAVAILABLE`, `INVALID_PAYLOAD`) sin volcado de trazas de dependencias. | Test 10 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-07** | **Prototype Pollution** | Inyección de claves `__proto__` o `constructor` en `customer_paper_preferences`. | **ALTA** | Acceso a propiedades seguro mediante enumeración estricta de claves canónicas (`interior`, `cover`, `endpaper`). Prototipo global de JavaScript intacto. | Test 11 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-08** | **Payloads con Cadenas Excesivas** | Envío de cadenas de 15.000 caracteres en `productName` para provocar DoS o desbordamiento de almacenamiento. | **MEDIA** | `sanitizePaperSectionPreference` limita `productName` a un máximo estricto de 150 caracteres. Cadenas mayores invalidan la preferencia. | Test 12 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-09** | **Gramajes Físicamente Imposibles** | Inyección de valores negativos (`gsm: -90`) o absurdos (`gsm: 99999`) para distorsionar cálculos de transporte. | **MEDIA** | Validación numérica estricta: `Number.isInteger(gsm) && gsm >= 30 && gsm <= 1000`. Valores fuera de rango son descartados. | Test 13 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-10** | **Inyección de Secciones Arbitrarias** | Inyección de secciones inventadas (`flyleaf`, `slipcase`, `packaging`) para alterar metadatos del pedido. | **BAJA** | Bucle cerrado sobre `['interior', 'cover', 'endpaper']`. Cualquier otra clave es descartada silenciosamente. | Test 15 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-11** | **Falsificación de Stock / Disponibilidad** | El cliente envía `availability: 'STOCK_GUARANTEED_BY_CLIENT'` o `isAvailable: true` para saltarse la confirmación de la imprenta. | **ALTA** | El servidor ignora el estado aportado por el cliente y asigna obligatoriamente `CUSTOMER_PREFERENCE_PENDING_CONFIRMATION`. | Test 16 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-12** | **Tampering de Precio (Fraude Económico)** | Modificación del importe presupuestado (ej. alterar 1.782,30 € a 10,00 €) en la sesión persistida o petición de compra. | **CRÍTICA** | Verificación criptográfica HMAC-SHA256 (`verifyOfferSignature`). Si el hash canónico del precio, moneda, expiración o specs no coincide exactamente, la creación de pedido es rechazada con HTTP 400. | Test 17 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |
| **SEC-13** | **Manipulación de Snapshot en Creación** | Intento de adulteración de especificaciones técnicas entre la sesión cotizada y la orden final. | **ALTA** | El snapshot canónico congela las especificaciones y precios de forma inmutable; cualquier intento de re-firma es detectado por la verificación de integridad. | Test 4, 18, 24 (`test_budget_01c_adversarial.js`) | **MITIGADO (PASS)** |

---

## 3. Análisis de Resiliencia ante Desconexión (Fail-Closed)

Se probó deliberadamente el corte de conectividad entre el Budget BFF y el servicio de Control Plane:
- **Comportamiento Observado**: El endpoint `/api/budget/paper/search` respondió inmediatamente con HTTP `502 Bad Gateway` y cuerpo JSON:
  ```json
  {
    "ok": false,
    "error": "CONTROL_PLANE_CATALOG_UNAVAILABLE",
    "message": "Paper catalog service is temporarily unreachable."
  }
  ```
- **Certificación de Neutralidad**: El servidor **no inventó datos sintéticos de catálogo** ni simuló existencias falsas en producción. El selector en la UI mostró el banner informativo correspondiente y permitió al usuario continuar con los presets estándar de imprenta sin degradar la seguridad.

---

## 4. Conclusión de Seguridad

La matriz de seguridad concluye con un **100% de vectores adversariales mitigados**. No se identifican vulnerabilidades de elevación de privilegios, fuga de secretos comerciales, omisión de firmas criptográficas ni inyección de identidades.
