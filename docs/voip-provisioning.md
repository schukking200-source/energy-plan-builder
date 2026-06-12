# VoIP provisioning platform

Deze repo bevat nu de eerste provisioning-laag voor de gewenste VoIP bestel- en activatieflow. De implementatie is bedoeld voor staging en backoffice-integratie: er worden nog geen productiecommando's uitgevoerd op Kamailio, FreeSWITCH of SippySoft.

## Doelarchitectuur

- Voiped/SippySoft blijft carrier-edge.
- Kamailio wordt de centrale SIP-control laag voor routing, dispatcher en failover.
- FreeSWITCH blijft call/media engine.
- PostgreSQL bewaart klanten, tenants, SIP-accounts, DID-status, orders, betalingen en provisioning jobs.
- De provisioning API start alleen na een expliciete DID-reservering en, voor webshop-orders, na een betaalbevestiging.

## Database

Migratie:

```text
supabase/migrations/20260612215200_7b78fdc5-6dd9-4c9e-a581-6e24d84f0934.sql
```

Belangrijkste tabellen:

- `voip_customers`
- `voip_tenants`
- `voip_subscriptions`
- `voip_did_numbers`
- `voip_did_reservations`
- `voip_sip_accounts`
- `voip_orders`
- `voip_payment_events`
- `voip_provisioning_jobs`
- `voip_provisioning_logs`
- `voip_watchdog_observations`

`public.voip_reserve_did()` reserveert een DID atomisch in PostgreSQL. Daardoor kan hetzelfde nummer niet tegelijk door twee orders actief gereserveerd worden.

## API endpoints

Alle provisioning endpoints vereisen:

```http
X-API-Key: <VOIP_PROVISIONING_API_KEY>
```

De payment webhook vereist:

```http
X-Webhook-Secret: <VOIP_PAYMENT_WEBHOOK_SECRET>
```

### POST /api/did/check

Controleert en reserveert een DID tijdelijk.

```json
{
  "did": "31205050111",
  "trunk": "AMS",
  "reservation_minutes": 15
}
```

### POST /api/order/create

Maakt een pending-payment order op basis van een actieve DID-reservering.

```json
{
  "customer_name": "Knurft BV",
  "tenant_code": "knurft-bv",
  "did": "31205050111",
  "extension": "1000",
  "reservation_id": "res_abc123",
  "plan_code": "voip-basic",
  "amount_cents": 1995
}
```

### POST /api/payment/webhook

Registreert een betaal-event idempotent. Bij `paid`, `succeeded` of `completed` start de provisioning job.

```json
{
  "provider": "ideal",
  "event_id": "evt_123",
  "order_number": "ord_123",
  "payment_reference": "pay_123",
  "status": "paid",
  "payload": {}
}
```

### POST /api/provision/customer

Provisioning direct starten vanuit backoffice, of op basis van een order.

```json
{
  "customer_name": "Knurft BV",
  "tenant_code": "knurft-bv",
  "did": "31205050111",
  "extension": "1000"
}
```

Of:

```json
{
  "order_id": "00000000-0000-0000-0000-000000000000"
}
```

## Provisioning stappen

De job schrijft elke stap naar `voip_provisioning_logs`:

1. customer en tenant aanmaken
2. subscription aanmaken
3. SIP-account aanmaken
4. DID toewijzen
5. Kamailio-route stap
6. FreeSWITCH directory/dialplan/reloadxml stap
7. SippySoft incoming-route stap
8. health-check stap
9. audit-event opslaan

De SIP-wachtwoordwaarde wordt alleen in de API-response teruggegeven wanneer het account nieuw is. In de database wordt een SHA-256 hash en een toekomstige `password_secret_ref` opgeslagen. Voor productie moet dit secret-ref naar een echte secrets manager of vault verwijzen.

## Integratiemodus

Standaard:

```text
VOIP_INTEGRATION_MODE=stub
```

In stub-modus worden Kamailio, FreeSWITCH, SippySoft en health-check acties gelogd als succesvolle stub-stappen. Dit is bewust: de eerste versie legt de veilige bestel/provisioningflow vast zonder productieservers te wijzigen.

Als `VOIP_INTEGRATION_MODE=live` wordt gezet, falen deze stappen met `live_integration_not_implemented`. Daarmee kan de API niet per ongeluk een schijnsucces geven voordat de echte adapters zijn gebouwd.

## Benodigde omgeving

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
VOIP_PROVISIONING_API_KEY=...
VOIP_PAYMENT_WEBHOOK_SECRET=...
VOIP_INTEGRATION_MODE=stub
```

Later toe te voegen voor live-integraties:

```text
SIPPYSOFT_XMLRPC_URL=...
SIPPYSOFT_API_USERNAME=...
SIPPYSOFT_API_PASSWORD=...
SIPPYSOFT_AMS_TRUNK_ID=...
SIPPYSOFT_INCOMING_ROUTE_ID=...
KAMAILIO_AMS_HOST=10.0.0.1
KAMAILIO_RTD_HOST=10.0.0.3
FREESWITCH_AMS_ESL_HOST=10.0.0.2
FREESWITCH_RTD_ESL_HOST=10.0.0.4
```

## Volgende technische stappen

1. SippySoft XML-RPC adapter implementeren zodra Voiped de API-documentatie en IDs levert.
2. Kamailio dispatcher/DID-route writer bouwen via gecontroleerde config-render + Ansible/deploy job.
3. FreeSWITCH directory/dialplan writer bouwen met reloadxml via ESL, niet via directe shell vanuit de payment webhook.
4. Een worker/queue toevoegen als provisioningjobs langer worden dan een webhookrequest.
5. Watchdog-worker toevoegen die `voip_watchdog_observations` vult en escalation-regels uitvoert.
