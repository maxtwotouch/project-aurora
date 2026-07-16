# Aurora App Redesign Proposal

## Branch

`redesign-2026-refresh`

## Goal

Bring Aurora in line with 2026 product expectations:

- clearer editorial hierarchy
- a stronger and more distinctive visual system
- better web adaptation instead of a straight mobile port
- improved accessibility and interaction quality
- a cleaner token-based foundation for future UI work

## Current Assessment

The app is functional and readable, but the presentation is still MVP-like:

- too many card surfaces
- a safe dark palette with limited character
- weak differentiation between primary and secondary information
- web layouts that feel like React Native screens inside a browser
- limited focus, hover, and motion polish

## Proposed Design Direction

### Concept

Aurora should feel like a field instrument mixed with a Nordic travel editorial.

That means:

- atmospheric, but not generic neon sci-fi
- data-first, but not dashboard-heavy
- premium and quiet, with selective vivid aurora accents

### Visual Principles

- Tint neutrals toward deep blue-green instead of using flat dark navy
- Use one expressive display face and one restrained reading face
- Make the "Tonight" recommendation the singular focal point
- Replace repeated boxed metrics with grouped data bands and stronger spacing rhythm
- Use motion for reveal and state changes, not decoration

## Product-Level Changes

### 1. Redesign the Tonight Screen

Turn it into a stronger decision surface:

- one dominant recommendation block
- one best-window timeline
- one top-spot module
- supporting forecast details moved lower in the hierarchy

The user should know within two seconds:

- should I go out
- when should I go
- where should I go

### 2. Rework Spot Cards

Current spot cards are serviceable but generic. Replace them with:

- stronger title hierarchy
- condensed metadata rows
- clearer trend signaling
- tap states and hover/focus states on web

### 3. Split Web and Native Layout Intent

Web should stop pretending to be a phone:

- wider max-width content framing
- asymmetric hero composition
- denser multi-column secondary sections on desktop
- map/detail combinations that use the larger canvas properly

### 4. Improve the Spot Detail Experience

The detail page should feel curated rather than stacked:

- visual hero with status summary
- more useful weather timeline treatment
- cleaner travel and parking guidance
- image treatment that feels editorial, not placeholder-driven

## Standards Alignment

### UI System

- move toward semantic design tokens instead of direct per-component colors
- define typography scale, spacing scale, and radius tiers centrally
- reduce one-off hex values inside components

### Accessibility

- visible focus states on web
- better press states across interactive surfaces
- stronger text/background contrast for secondary text
- more consistent screen-reader labels for buttons and navigation

### Responsive Behavior

- responsive composition, not just smaller padding
- desktop-specific web layouts for overview and detail pages
- preserve core actions across screen sizes

### Motion

- introduce restrained entrance choreography for primary sections
- use transform/opacity transitions only
- respect reduced motion preferences on web

## Suggested Implementation Order

1. Introduce new tokens and visual primitives
2. Redesign `TonightScreen`
3. Redesign `SpotCard`
4. Redesign spot detail screens
5. Apply web-specific layout improvements
6. Polish navigation and tab presentation

## Deliverables For This Branch

- proposal document
- refreshed theme tokens
- redesigned core surfaces
- web-specific layout improvements
- follow-up cleanup of remaining legacy styles
