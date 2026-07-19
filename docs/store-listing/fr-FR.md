# App Store listing — fr-FR (Français)

> **Draft translation notice:** this locale's copy was drafted by an AI agent using the app's own `src/i18n/locales/fr.json` catalog for terminology, not by a professional translator. Per `docs/roadmap-2026-27.md` Phase 1 ("Native-speaker review of consent copy + store copy (de/fr/es/zh) — legal and quality gate before paid traffic"), **do not submit this locale to App Store Connect without a native-speaker review first.**

## App name
**Aurore Tromsø**

Character count: 13 / 30.

Localized form of the proposed en-US name "Aurora Tromsø" (see that file's app-name note for the branding-mismatch open item, which applies identically here).

## Subtitle
**Prévision d'aurore ce soir**

Character count: 26 / 30.

## Promotional text
Score aurore en direct, meilleur créneau ce soir, et 28 sites nommés autour de Tromsø avec infos d'accès. Cinq langues. Sans compte, sans pistage.

Character count: 146 / 170. (Promotional text can be updated any time without a new binary submission — App Store Connect > App Store tab > this field is not versioned with the build.)

## Keywords
`aurores boréales,norvège,arctique,indice kp,nuit polaire,webcam,points de vue,ce soir,prévision`

Character count: 95 / 100. Comma-separated, no spaces after commas (spaces cost characters and Apple's keyword matching does not need them).

**Reasoning per term** (why each word/phrase is here, and why words already in the app name/subtitle are deliberately *not* repeated — Apple indexes name + subtitle + keywords together for search, so duplicating a word already present elsewhere wastes budget that could cover new ground):

- Le nom "Aurore Tromsø" et le sous-titre couvrent déjà "aurore", "tromsø" et "prévision"/"ce soir" — non répétés à l'identique ici, sauf "prévision" et "ce soir" repris en fin de liste faute de meilleurs termes disponibles sous 100 caractères (compromis assumé, à revoir si un natif propose mieux).
- "aurores boréales" — la formulation complète la plus recherchée en français, distincte du seul mot "aurore" du nom.
- "norvège", "arctique" — désambiguïsation géographique pour les recherches génériques.
- "indice kp" — terme technique réel utilisé par l'app (`tonight.band.kpNow`), recherché par les chasseurs d'aurores.
- "nuit polaire" — reflète honnêtement la gestion de la saisonnalité par l'app (état "saison fermée").
- "webcam" — fonctionnalité réelle (caméras du ciel en direct), terme court et largement compris en français.
- "points de vue" — reprend le concept des sites d'observation sans dupliquer "sites" du sous-titre.

## Description
Character count: 3343 (~2500 targeted per the task brief; Apple's actual field limit is ~4000, so this has headroom). Benefit-led, no superlatives ("best", "amazing", etc. deliberately avoided per Apple's Guideline 2.3.1 and this app's own factual/warm tone — see `src/i18n/locales/fr.json` for the in-app voice this matches).

```
Tromsø, en Norvège, se trouve à l'intérieur de l'ovale auroral — l'un des endroits les plus fiables au monde pour observer les aurores boréales, environ de septembre à avril. Aurora Tromsø vous aide à décider où et quand sortir ce soir, à partir de données météo et géomagnétiques en direct plutôt qu'au hasard.

LA PRÉVISION DU SOIR, EN UN COUP D'ŒIL
Ouvrez l'application et consultez un score aurore sur 100 pour ce soir, calculé à partir de la couverture nuageuse, de l'obscurité et de l'indice KP planétaire (activité géomagnétique). L'application met en avant le meilleur créneau de trois heures et s'actualise automatiquement au fil de la soirée.

28 SITES NOMMÉS AUTOUR DE TROMSØ
Comparez 28 sites fixes — fjords, lacs et points de vue sombres en dehors de la pollution lumineuse de la ville — chacun avec son propre score en direct, sa distance depuis le centre-ville et une courte description. De nombreux sites indiquent des informations pratiques pour s'y rendre, comme l'arrêt de bus et le parking les plus proches ; lorsqu'ils sont marqués « vérifié », ces éléments ont été recoupés avec des informations de la Tromsø kommune. Triez la liste par prévision la plus forte ou par trajet le plus court, et ouvrez l'itinéraire en un geste.

CARTE, CAMÉRAS DU CIEL EN DIRECT ET IMAGES D'AURORE
Repérez tous les sites sur une carte dans l'ordre du trajet, vérifiez une grille de caméras du ciel en direct avant de partir, et consultez des images récentes d'aurore issues d'un flux universitaire (UiT / NO-SPACE) pour juger des conditions par vous-même.

HONNÊTE SUR LA LUMIÈRE DU JOUR AUSSI
Tromsø se trouve au nord du cercle polaire arctique : de la mi-mai à fin juillet environ, le soleil de minuit garde le ciel clair toute la nuit — il n'y a alors aucune chance réaliste de voir une aurore, quel que soit l'indice KP. Plutôt que d'afficher un score trompeur durant cette période, l'application indique clairement que la saison des aurores est actuellement fermée et donne la date approximative de sa reprise.

CINQ LANGUES
L'application est entièrement disponible en anglais, allemand, français, espagnol et chinois (simplifié), modifiable à tout moment dans les réglages — utile en voyage ou pour prêter le téléphone à quelqu'un.

CONFIDENTIALITÉ PAR DÉFAUT
L'application fonctionne entièrement sans compte, sans connexion et sans configuration, et ne demande jamais votre position GPS — chaque « distance » affichée est calculée à partir des coordonnées fixes d'un site, jamais en vous suivant. Si vous le souhaitez, vous pouvez choisir de partager des statistiques anonymes et agrégées (quels sites sont consultés ou utilisés pour naviguer, regroupées par heure) afin que nous et la Tromsø kommune sachions quels sites sont réellement utiles. Refuser ne change rien au fonctionnement de l'application, et vous pouvez activer ou désactiver ce partage à tout moment dans les réglages. Cette application ne contient aucun traceur ni SDK publicitaire tiers.

SOURCES DE DONNÉES
Météo fournie par MET Norway (l'institut météorologique norvégien) et activité géomagnétique fournie par le Space Weather Prediction Center de la NOAA, actualisées régulièrement au fil de la nuit.

Aurora Tromsø a un seul lieu et un seul objectif : une réponse honnête et sans détour à la question « dois-je sortir regarder ce soir ? » — ni plus, ni moins.
```

## What's New template
Use for every release's App Store Connect "What's New in This Version" field. Fill in the
bracketed part per release; keep the rest as a stable, low-effort template so release notes
don't become a chore that gets skipped.

```
Cette mise à jour actualise le pipeline de prévision et les détails des sites. Sources de données : Réglages > À propos. Questions ou corrections de sites : via le lien d'assistance de cette page.
```
