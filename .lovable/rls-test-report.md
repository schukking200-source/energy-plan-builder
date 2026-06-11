# RLS & datacompartimenten — testrapport

_Gegenereerd na statusstappen-uitbreiding en upload-validatie. Plaats dit document naast hoofdstuk **Security / Privacy** van de aanbesteding._

## 1. Datamodel-compartimenten

| Tabel / bucket | Compartiment | Eigenaarsleutel |
|---|---|---|
| `public.in_measurement` | Opname per adviseur | `captured_by = auth.uid()` |
| `public.id_profiles` | Persoonsprofiel | `id = auth.uid()` |
| `public.user_roles` | Rollen | `user_id = auth.uid()` (+ admin globaal) |
| `public.aud_events` | Audit-trail (append-only, hash-chained) | rol-gebaseerd |
| `storage.objects` bucket `lidar-scans` | LiDAR-scan per opname | pad `{user_id}/{measurement_id}/scan.{ext}` |

## 2. Policy-matrix `in_measurement`

| Actie | Adviseur (eigen) | Adviseur (andermans) | Kwaliteit / Steekproef | Admin |
|---|---|---|---|---|
| SELECT | ✅ `captured_by = uid` | ❌ | ✅ reviewer-policy | ✅ |
| INSERT | ✅ moet `captured_by = uid` | ❌ | ❌ | ✅ |
| UPDATE inhoud | ✅ alleen status=`draft` | ❌ | ❌ (alleen status) | ✅ |
| UPDATE status | via trigger `draft→submitted` | ❌ | ✅ `submitted→in_review/approved/rejected` | ✅ |
| DELETE | ❌ | ❌ | ❌ | ✅ |

**Statusovergangen worden afgedwongen** door `in_measurement_status_guard` (BEFORE UPDATE trigger). Een capturer die probeert `draft → approved` te springen krijgt: `Ongeldige statusovergang draft -> approved voor deze gebruiker`.

## 3. Policy-matrix `storage.objects` (bucket `lidar-scans`)

| Actie | Uploader (eigen map) | Andere adviseur | Reviewer (kwaliteit/steekproef) | Admin |
|---|---|---|---|---|
| INSERT | ✅ pad moet starten met eigen `uid` | ❌ | ❌ | ✅ |
| SELECT | ✅ alleen eigen map | ❌ | ✅ alle scans | ✅ |
| UPDATE | ✅ eigen map | ❌ | ❌ | ✅ |
| DELETE | ❌ | ❌ | ❌ | ✅ |

Bestanden zijn dus **append-only voor reviewers** (immutable bewijslast). Toegang gebeurt via tijdelijke signed URL (10 minuten) — geen publieke directe URL.

## 4. Te valideren scenario's (handmatige test)

Log in als verschillende rollen en bevestig:

1. **Adviseur A** maakt opname → ziet alleen eigen rij in `/intake`. Probeer URL `/intake/<id-van-B>` → 404/leeg.
2. **Adviseur A** zet eigen opname op `submitted` → status muteert; tweede submit faalt (transitie ongeldig).
3. **Kwaliteit** opent `/intake/<id>` → ziet alle opnames + Approve/Reject knoppen.
4. **Kwaliteit** keurt opname goed → `reviewed_by` en `reviewed_at` worden automatisch gezet door trigger.
5. **Bewoner** (geen reviewer-rol) opent `/intake` → leeg overzicht; `/intake/new` werkt niet (geen `adviseur`-rol in nav).
6. **Steekproef** download LiDAR-scan via signed URL → werkt; rechtstreekse path-toegang zonder token faalt.
7. **Admin** verwijdert opname → werkt; alle anderen krijgen RLS-fout bij delete.

## 5. Bekende uitsluitingen

- Anon (uitgelogd) heeft **nul** zichtbaarheid op alle tabellen — geen `GRANT TO anon`.
- `aud_events` is append-only via BEFORE UPDATE/DELETE blocker `aud_events_block_mutation`. Hash-chain trigger (`aud_events_hash_chain`) levert tamper-evident log.
- `roomplan_json` en `lidar_point_cloud_ref` zijn optioneel; ontbreken breekt geen flow (fallback = handmatige invoer).
