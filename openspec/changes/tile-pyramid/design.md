## Architecture Overview

Système de pyramide de tuiles raster pré-calculées, servies comme fichiers statiques depuis un CDN mondial. Zéro calcul au moment de l'affichage.

## Components

### 1. Tile Worker (Cloudflare Worker)

**Runtime** : Cloudflare Workers (V8 isolate, 128MB RAM, 30s CPU max)
**Image processing** : `@cloudflare/workers-images` ou Sharp via wasm (`@aspect-build/sharp-wasm`)
**Déclencheur** : webhook Supabase sur INSERT/UPDATE/DELETE `publications`

#### Endpoints

```
POST /webhook/publication
  Body: { event: "INSERT"|"UPDATE"|"DELETE", record: Publication }
  → Déclenche la régénération des tuiles affectées

GET /tiles/{z}/{x}/{y}.webp
  → Fallback si la tuile n'existe pas dans R2
  → Retourne empty_tile.webp avec header X-Tile-Empty: true
```

#### Pipeline de génération

```
receive webhook
  │
  ├─ Extract: image_url, cell_id, lat, lng
  │
  ├─ Convert cell_id → affected XYZ tiles at z14
  │  (une case 1km peut toucher 1-4 tuiles selon sa position)
  │
  ├─ For each affected z14 tile:
  │   │
  │   ├─ Query: toutes les publications actives dans cette tuile
  │   │  (SELECT * FROM publications JOIN squares
  │   │   WHERE tile covers square bounds AND status IN (actif))
  │   │
  │   ├─ Render z14 tile:
  │   │   canvas = new Image(512, 512)
  │   │   fill(canvas, "#111118")                    // fond sombre
  │   │   for each cell in tile bounds:
  │   │     draw_cell_border(canvas, cell, "#2a2a3e") // grille
  │   │     if cell has publication:
  │   │       draw_image(canvas, cell, photo)         // photo
  │   │   encode(canvas, "webp", quality=82)
  │   │
  │   ├─ PUT R2 /tiles/14/{x}/{y}.webp
  │   │
  │   └─ Propagate up: regenerate parent tiles z13→z0
  │       │
  │       for z = 13 down to 0:
  │         parent_x = floor(x / 2^(14-z))
  │         parent_y = floor(y / 2^(14-z))
  │         children = [
  │           GET R2 /tiles/{z+1}/{parent_x*2}/{parent_y*2}.webp
  │           GET R2 /tiles/{z+1}/{parent_x*2+1}/{parent_y*2}.webp
  │           GET R2 /tiles/{z+1}/{parent_x*2}/{parent_y*2+1}.webp
  │           GET R2 /tiles/{z+1}/{parent_x*2+1}/{parent_y*2+1}.webp
  │         ]  // parallel fetch
  │         canvas = compose_4(children, 512)
  │         PUT R2 /tiles/{z}/{parent_x}/{parent_y}.webp
  │
  └─ Purge CDN cache for all modified tile URLs
```

#### Optimisations

- **Deduplication** : si plusieurs uploads touchent la même tuile parent, ne la régénérer qu'une fois. Utiliser une queue (Cloudflare Queue) avec dedup par clé `{z}/{x}/{y}`.
- **Skip empty parents** : si les 4 enfants sont vides, écrire un redirect vers `empty_tile.webp` au lieu de composer.
- **Batch propagation** : pour z0-z5, régénérer au maximum toutes les 5 minutes (cron), pas à chaque upload.

### 2. Tile Storage (Cloudflare R2)

**Bucket** : `tessra-tiles`
**Structure** :
```
tessra-tiles/
├── tiles/
│   ├── 0/0/0.webp              (tuile monde)
│   ├── 1/0/0.webp ... 1/1/1.webp
│   ├── ...
│   ├── 14/{x}/{y}.webp         (tuiles de base)
│   └── empty.webp              (tuile vide réutilisable, ~2KB)
├── meta/
│   └── dirty.json              (tuiles à régénérer, pour batch)
```

**Format tuiles** :
- Taille : 512×512 pixels
- Format : WebP lossy, quality 82
- Poids moyen : 15-30KB (avec photo), 2KB (vide)

### 3. CDN & Routing (Cloudflare)

**Domaine** : `tiles.tessra.app`

**Routing** :
```
GET tiles.tessra.app/{z}/{x}/{y}.webp
  │
  ├─ CDN cache hit → return (5-15ms)
  │
  ├─ R2 file exists → return + cache (20-50ms)
  │
  └─ R2 file missing → return empty.webp + cache (20-50ms)
      (avec header Cache-Control court pour qu'elle soit
       remplacée quand le worker la génère)
```

**Cache rules** :
```
z 0-5:   Cache-Control: public, max-age=3600, s-maxage=3600
z 6-10:  Cache-Control: public, max-age=600, s-maxage=600
z 11-13: Cache-Control: public, max-age=120, s-maxage=120
z 14:    Cache-Control: public, max-age=30, s-maxage=30
```

### 4. Client Mapbox (React Native)

**Remplacement complet de SquareLayer** :

```tsx
// Avant: rendu vectoriel complexe
<ShapeSource id="grid" shape={gridGeoJSON}>
  <FillLayer ... />
  <LineLayer ... />
</ShapeSource>

// Après: une seule source raster
<Mapbox.RasterSource
  id="tessra-tiles"
  tileUrlTemplates={["https://tiles.tessra.app/{z}/{x}/{y}.webp"]}
  tileSize={512}
  minZoomLevel={0}
  maxZoomLevel={14}
>
  <Mapbox.RasterLayer
    id="tessra-photo-layer"
    style={{
      rasterOpacity: 1,
      rasterFadeDuration: 150,  // fondu progressif flou→net
    }}
  />
</Mapbox.RasterSource>
```

**Optimistic UI après upload** :

```tsx
// Overlay temporaire de la photo uploadée
// en attendant que le tile worker régénère la tuile
<Mapbox.Images images={{ lastUpload: localPhotoUri }} />
<Mapbox.SymbolLayer
  id="optimistic-upload"
  style={{
    iconImage: "lastUpload",
    iconSize: calculatedSize,  // basé sur le zoom
  }}
  filter={["==", "id", lastUploadCellId]}
/>
// Supprimé automatiquement quand la tuile raster se rafraîchit
```

### 5. Webhook Supabase

**Trigger** : après INSERT, UPDATE (status change), DELETE sur `publications`

```sql
-- Supabase webhook configuration
-- URL: https://tile-worker.tessra.workers.dev/webhook/publication
-- Events: INSERT, UPDATE, DELETE
-- Table: publications
-- Condition: (pour UPDATE) OLD.status != NEW.status
```

**Payload envoyé** :
```json
{
  "event": "INSERT",
  "record": {
    "id": "uuid",
    "square_id": "uuid",
    "image_url": "https://...",
    "status": "active"
  },
  "square": {
    "cell_id": "r5380c260",
    "lat": 48.856,
    "lng": 2.352
  }
}
```

## Data Model Changes

Aucun changement au schéma Supabase. Les tuiles vivent exclusivement dans R2, en dehors de la DB.

Ajout optionnel d'une colonne pour tracking :
```sql
ALTER TABLE squares ADD COLUMN tile_dirty BOOLEAN DEFAULT false;
-- Marqué true quand une publication change
-- Remis à false quand le tile worker a régénéré
-- Utile pour le batch processing des tuiles basses
```

## Key Decisions

1. **Tuiles 512×512 (pas 256)** — meilleure qualité sur écrans Retina, standard Mapbox moderne. Poids ~2× mais qualité perçue nettement supérieure.

2. **WebP (pas JPEG/PNG)** — 30% plus léger que JPEG à qualité égale. Supporté par tous les navigateurs/apps modernes.

3. **Zoom max 14 (pas 18)** — une tuile z14 couvre ~2.4km, suffisant pour voir les cases 1km en détail. Au-delà, Mapbox fait de l'overzoom natif (étire z14). Réduit le nombre de tuiles de 16× par niveau évité.

4. **Cloudflare R2 + Workers (pas Supabase Storage)** — zéro egress fees, CDN intégré, Workers pour le traitement d'image. Supabase Storage n'a pas de CDN mondial et facturerait la bande passante.

5. **Pré-rendu + cache (pas rendu à la volée)** — la fluidité impose que chaque tuile soit un fichier statique déjà prêt. Aucun calcul au moment de l'affichage.

6. **Grille dessinée dans les tuiles (pas côté client)** — simplifie radicalement le client. Une seule RasterSource remplace tout le système ShapeSource/FillLayer/LineLayer.
