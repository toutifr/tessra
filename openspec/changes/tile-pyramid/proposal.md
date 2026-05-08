## Why

Aujourd'hui les photos ne sont visibles qu'à partir du zoom 9, et seulement comme des marqueurs individuels sur la carte Mapbox. Au zoom bas, l'utilisateur voit une carte vide — aucune raison de zoomer, aucune invitation à explorer.

L'objectif est de transformer Tessra en un **mur de photos mondial** visible dès le zoom 0. Chaque case de la grille 1km doit être visible à tous les niveaux de zoom, avec une compression/fusion intelligente aux zooms bas. Le comportement doit être identique aux tuiles satellite de Google Maps : fluide, instantané, progressif (flou → net en zoomant).

Cela nécessite un système de **pyramide de tuiles raster** : des images pré-calculées à chaque niveau de zoom, servies comme fichiers statiques depuis un CDN mondial.

## What Changes

### Nouveau : Tile Worker (Cloudflare Worker)

Service backend qui, à chaque publication de photo :

1. **Génère la tuile de base** (zoom 14) — dessine la photo dans sa case, avec la grille et le fond sombre pour les cases vides
2. **Remonte la pyramide** (zoom 13 → 0) — fusionne 4 tuiles enfants en 1 tuile parent à chaque niveau, par redimensionnement successif
3. **Écrit les tuiles** dans Cloudflare R2 (stockage statique)

### Nouveau : Tile Storage (Cloudflare R2 + CDN)

- Fichiers webp statiques : `/tiles/{z}/{x}/{y}.webp`
- CDN Cloudflare intégré avec cache par niveau de zoom
- Zéro egress fees (R2)

### Modifié : Client Mapbox (app mobile)

- Remplacement du `SquareLayer` vectoriel par un `RasterSource` Mapbox pointant sur `https://tiles.tessra.app/{z}/{x}/{y}.webp`
- Optimistic UI : affichage local immédiat de la photo après upload, avant que le tile worker ait fini
- Suppression du rendu de grille côté client (la grille est dessinée dans les tuiles)

### Modifié : Upload flow

- Après upload dans Supabase Storage, un webhook déclenche le tile worker
- Le client n'attend pas la régénération des tuiles

## Capabilities

### New Capabilities

- `tile-generation`: Tile worker qui génère et met à jour la pyramide de tuiles raster à chaque publication/expiration
- `tile-serving`: Infrastructure de stockage et distribution des tuiles (R2 + CDN)

### Modified Capabilities

- `map-view`: Passe d'un rendu vectoriel (ShapeSource/FillLayer) à un rendu raster (RasterSource) pour les photos. La grille et le fond sombre sont intégrés dans les tuiles.
- `image-upload`: Ajoute le déclenchement du tile worker après upload
- `square-lifecycle`: L'expiration d'une publication déclenche la régénération des tuiles concernées (remplacer la photo par une case vide)

## Impact

- **Nouvelle infrastructure** : Cloudflare Worker + R2 bucket + domaine `tiles.tessra.app`
- **Supabase** : webhook sur INSERT/UPDATE `publications` pour déclencher le tile worker
- **Client** : refonte du rendu carte (plus simple — un RasterSource remplace SquareLayer)
- **Storage** : ~30 bytes/tuile × 15 niveaux × nombre de tuiles non-vides. Estimé ~3GB pour 100K photos, ~300GB pour 10M photos.
- **Coût** : < $5/mois à 100K photos, ~$100/mois à 10M photos (R2 + Workers)

## Architecture

```
WRITE PATH (upload/expiration)

  📱 Upload photo → Supabase Storage
       │
       │ INSERT publications → webhook
       ▼
  ┌─────────────────────────────────────┐
  │  Cloudflare Worker: tile-builder     │
  │                                      │
  │  1. Fetch photo depuis Supabase      │
  │  2. Convertir cell_id → tuile XYZ   │
  │     (lat/lng → Mercator tile coords) │
  │  3. Dessiner tuile z14:              │
  │     - fond sombre (#111118)          │
  │     - grille (bordures #2a2a3e)      │
  │     - photo dans sa case             │
  │  4. Remonter la pyramide z13→z0:     │
  │     - lire 4 tuiles enfants          │
  │     - shrink 256×256 chacune         │
  │     - assembler en 512×512           │
  │     - écrire dans R2                 │
  │  5. Purger cache CDN si nécessaire   │
  └─────────────────────────────────────┘
       │
       ▼
  Cloudflare R2: /tiles/{z}/{x}/{y}.webp


READ PATH (affichage)

  📱 Mapbox RasterSource
       url: "https://tiles.tessra.app/{z}/{x}/{y}.webp"
       │
       ▼
  Cloudflare CDN edge (5-15ms, cache hit 99%)
       │ miss
       ▼
  Cloudflare R2 (20-50ms, fichier statique)
```

### Cache strategy par niveau de zoom

| Zoom | Taille couverte | Fréquence de changement | Cache TTL |
|------|----------------|------------------------|-----------|
| 0-5 | Continent/Monde | Rarement | 1 heure |
| 6-10 | Pays/Région | Parfois | 10 minutes |
| 11-13 | Ville/Quartier | Souvent | 2 minutes |
| 14 | Cases individuelles | À chaque upload | 30 secondes |

### Rendu par niveau de zoom

| Zoom | Ce qu'on voit | Grille visible ? |
|------|--------------|-----------------|
| 0-3 | Taches de couleur (agrégat de milliers de photos) | Non |
| 4-7 | Densité par zone (villes vs campagne) | Non |
| 8-11 | Points de couleur par quartier | Commence à apparaître |
| 12-13 | Miniatures floues par case | Oui |
| 14+ | Photos nettes dans leurs cases | Oui, bien visible |

### Tuiles vides

Les cases sans photo ne sont pas du vide — elles montrent un fond sombre avec bordure de grille fine. Au zoom bas, les zones sans photo apparaissent comme du fond sombre uniforme, créant un contraste naturel avec les zones couvertes.

Une tuile entièrement vide (aucune photo dans la zone) est un seul fichier `empty_tile.webp` réutilisé partout via redirect ou règle CDN.

### Mapping kmGrid → XYZ

Le tile worker convertit les coordonnées kmGrid (`cell_id: "r5380c260"`) en coordonnées de tuile Mercator :

```
lat/lng du centre de la case → tile_x, tile_y au zoom z
formule standard Mercator:
  tile_x = floor((lng + 180) / 360 × 2^z)
  tile_y = floor((1 - ln(tan(lat) + sec(lat)) / π) / 2 × 2^z)
```

Plusieurs cases 1km peuvent tomber dans une même tuile XYZ — le worker dessine toutes les cases présentes dans chaque tuile.

## Non-goals (V2+)

- Tuiles vectorielles (protocole MVT) — le raster est suffisant et plus simple
- Zoom > 14 (subdivision des cases 1km)
- Rendu 3D des photos
- Tile server dynamique (tout est pré-calculé)
- Animations de transition entre zooms (Mapbox gère le fondu nativement)
- Personnalisation du style de grille par l'utilisateur
