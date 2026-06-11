ALTER TABLE public.roadmap_task
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS module_label text,
  ADD COLUMN IF NOT EXISTS module_order smallint,
  ADD COLUMN IF NOT EXISTS is_project_blocker boolean NOT NULL DEFAULT false;

-- Map bestaande fases naar modules
UPDATE public.roadmap_task SET module='foundation', module_label='Foundation (auth, rollen, audit)', module_order=2 WHERE phase=1;
UPDATE public.roadmap_task SET module='object', module_label='Object & relaties (BAG)', module_order=3 WHERE phase=2;
UPDATE public.roadmap_task SET module='opname', module_label='Opname-flow (web fallback)', module_order=4 WHERE phase=3;
UPDATE public.roadmap_task SET module='rekenkern', module_label='Rekenkern + M29-regels', module_order=5 WHERE phase=4;
UPDATE public.roadmap_task SET module='rapportage', module_label='Rapportage & wijzigingsverzoeken', module_order=6 WHERE phase=5;
UPDATE public.roadmap_task SET module='kwaliteit', module_label='Kwaliteitscommissie & steekproef', module_order=7 WHERE phase=6;
UPDATE public.roadmap_task SET module='uitvoering', module_label='Uitvoering & subsidiebewijs', module_order=8 WHERE phase=7;
UPDATE public.roadmap_task SET module='audit', module_label='Audit-export & overdracht', module_order=9 WHERE phase=8;
UPDATE public.roadmap_task SET module='go_live', module_label='Go-live blockers (Azure-build)', module_order=10 WHERE phase=9;

-- Seed Module 0 — LiDAR / iPad (project-blocker)
INSERT INTO public.roadmap_task (phase, phase_label, sort_order, title, description, status, type, is_golive_blocker, is_project_blocker, module, module_label, module_order)
VALUES
  (0,'LiDAR / iPad',10,'Apple Developer-account actief','€99/jaar account live op developer.apple.com','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1),
  (0,'LiDAR / iPad',20,'Xcode 26.2 + iOS 26.5 device support','Xcode op Mac + iOS 26.5 device support gedownload','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1),
  (0,'LiDAR / iPad',30,'iPad Developer Mode aan + getrust','Instellingen → Privacy → Developer Mode + Mac vertrouwen','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1),
  (0,'LiDAR / iPad',40,'Capacitor iOS-project gegenereerd','bunx cap add ios + cap sync ios uitgevoerd','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1),
  (0,'LiDAR / iPad',50,'RoomPlanPlugin toegevoegd aan Xcode-target','Swift + .m bestanden in App-target met bridging header','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1),
  (0,'LiDAR / iPad',60,'Camera-permissie in Info.plist','NSCameraUsageDescription voor LiDAR-scan','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1),
  (0,'LiDAR / iPad',70,'Signing team + bundle-id ingesteld','Apple Developer-team gekoppeld, bundle-id uniek','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1),
  (0,'LiDAR / iPad',80,'App installeert op fysieke iPad','Cmd+R levert werkende app op iPad via kabel','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1),
  (0,'LiDAR / iPad',90,'RoomPlan-scan opent + voltooit','Knop in opname-formulier triggert RoomPlan fullscreen','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1),
  (0,'LiDAR / iPad',100,'USDZ + JSON upload naar Storage werkt','Scan-resultaat geüpload naar lidar-scans bucket','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1),
  (0,'LiDAR / iPad',110,'End-to-end: scan → opname → ingediend','Volledige flow getest op iPad zonder fouten','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1),
  (0,'LiDAR / iPad',120,'TestFlight-build live','1 externe tester kan app installeren via TestFlight','open','mvp0',true,true,'lidar','LiDAR / iPad (project-blocker)',1);
