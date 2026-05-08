## Tasks

### Phase 1 : Infrastructure Cloudflare (P0)

- [x] **T1.1** Créer le projet Cloudflare Workers (`tile-worker`) avec wrangler
  - Config R2 binding, domaine `tiles.tessra.app`
  - Générer et stocker `empty_tile.webp` (fond sombre + grille)

- [x] **T1.2** Implémenter la conversion kmGrid → XYZ
  - Fonction `cellToTiles(cell_id, zoom)` : retourne les tuiles XYZ qui contiennent cette case
  - Fonction `tilesForBounds(sw, ne, zoom)` : toutes les tuiles dans un rectangle
  - Tests unitaires de conversion

- [x] **T1.3** Implémenter le rendu de tuile z14 (tuile de base)
  - Dessiner fond sombre, grille, photos dans leurs cases
  - Input : liste de cases avec leurs photos pour une tuile donnée
  - Output : image WebP 512×512
  - Sharp wasm ou canvas API dans le Worker

- [x] **T1.4** Implémenter la propagation pyramidale z13→z0
  - Lire 4 tuiles enfants depuis R2
  - Composer en 1 tuile parent (shrink + assemble)
  - Écrire dans R2
  - Gérer les enfants manquants (= vide)

- [x] **T1.5** Configurer R2 bucket + CDN routing
  - Bucket `tessra-tiles`
  - Route `tiles.tessra.app/{z}/{x}/{y}.webp` → R2
  - Cache rules par niveau de zoom
  - Fallback vers `empty.webp` si tuile absente

### Phase 2 : Intégration Supabase → Worker (P0)

- [x] **T2.1** Configurer le webhook Supabase
  - Trigger sur INSERT/UPDATE/DELETE `publications`
  - Payload avec publication + square (cell_id, lat, lng, image_url)
  - Authentification du webhook (secret partagé)

- [x] **T2.2** Endpoint webhook dans le Worker
  - Recevoir et valider le payload
  - INSERT → régénérer les tuiles de la case
  - DELETE/expiration → régénérer avec case vide
  - UPDATE status → régénérer si changement visuel

- [x] **T2.3** Implémenter le batch processing pour zooms bas
  - Queue (Cloudflare Queue) pour dédupliquer les régénérations
  - z14-z11 : régénération immédiate
  - z10-z0 : batch toutes les 5 minutes via cron trigger

### Phase 3 : Client Mapbox (P0)

- [x] **T3.1** Remplacer SquareLayer par RasterSource
  - Supprimer le rendu vectoriel (ShapeSource, FillLayer, LineLayer)
  - Ajouter `Mapbox.RasterSource` pointant sur `tiles.tessra.app`
  - Configurer `minZoomLevel: 0`, `maxZoomLevel: 14`, `tileSize: 512`
  - Tester la fluidité du zoom 0→14

- [x] **T3.2** Optimistic UI après upload
  - Afficher la photo localement immédiatement après upload
  - Overlay temporaire (SymbolLayer ou ImageSource) sur la case
  - Retirer l'overlay quand la tuile raster est rafraîchie
  - Forcer le refresh de la tuile après ~5 secondes

- [x] **T3.3** Adapter l'interaction tap sur case
  - Actuellement : tap sur le FillLayer polygone
  - Nouveau : convertir tap coordinates → cell_id via kmGrid
  - Ouvrir le même écran de détail/upload

- [x] **T3.4** Nettoyer le code client obsolète
  - Supprimer `SquareLayer.tsx` (remplacé par RasterSource)
  - Supprimer le calcul de grille côté client dans `index.tsx` (plus besoin de `cellsInBounds` pour le rendu)
  - Garder `kmGrid.ts` pour le tap → cell_id et l'upload

### Phase 4 : Gestion des expirations (P1)

- [x] **T4.1** Régénérer les tuiles à l'expiration des publications
  - Le cron d'expiration existant doit aussi notifier le tile worker
  - Quand une publication expire → régénérer la tuile avec case vide
  - Batch : regrouper toutes les expirations de la minute

### Phase 5 : Seed & test (P1)

- [x] **T5.1** Script de seed pour générer des tuiles initiales
  - Prendre toutes les publications actives
  - Générer toutes les tuiles z14 puis propager z13→z0
  - Utile pour le premier déploiement et les tests

- [ ] **T5.2** Tests end-to-end
  - Upload photo → vérifier tuile z14 générée dans R2
  - Vérifier propagation jusqu'à z0
  - Vérifier expiration → tuile régénérée sans photo
  - Vérifier fluidité client (pas de blanc, transitions fluides)
