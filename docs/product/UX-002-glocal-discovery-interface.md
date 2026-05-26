# UX-002: Glocal Discovery Interface

Status: Draft  
Date: 2026-04-29

## Summary

The Glocal Music concept points to a reusable ResonantOS discovery pattern: a rich search interface that combines semantic search, filters, timeline navigation, and world-map navigation.

The original Glocal Music startup applied this to independent music, artists, labels, fans, events, downloads, news, learning, finance, and community services. In ResonantOS this can become a general interface pattern for exploring any large knowledge, marketplace, or community dataset.

## Core Idea

Users should not only search by keyword. They should be able to explore data through multiple dimensions at once:

- semantic query
- category
- role or account type
- location
- time
- mood
- function or use case
- relationship graph
- popularity or ratings
- price or access model
- trust/provenance state
- media type
- ownership or source domain

The interface should make complex data feel navigable rather than forcing users to read lists.

## Primary Views

### Search

The search bar remains the fastest entry point.

Search should support:

- plain language queries
- structured filters
- saved searches
- AI-assisted query refinement
- result explanations
- source/provenance visibility

### Map

The map shows where things are happening or where knowledge originates.

Possible uses:

- artists by city or scene
- add-ons by creator/community region
- archive sources by location
- events, opportunities, partners, local communities
- research and news geographically grouped

Map location must not imply exact private user location unless the user explicitly enables it.

### Timeline

The timeline shows how data changes over time.

Possible uses:

- music releases
- events and tours
- project history
- archive evolution
- add-on version history
- community activity
- trends and signals

Timeline should support zoom levels such as day, month, year, era, and project phase.

### Graph

The graph shows relationships between entities.

Possible uses:

- artist to label
- add-on to capability
- user archive topic to source
- project to people
- event to place
- claim to evidence

The graph should be optional because it can become visually noisy.

## Add-on Store Application

For the Add-on Store, this pattern can create a stronger interface than a simple list of cards.

Store discovery could support:

- filter by category, platform, capability, price, rating, trust tier, and install state
- map view of creator communities or ecosystem activity
- timeline view of add-on releases and updates
- graph view of add-ons, dependencies, capabilities, and compatible workflows
- AI-guided discovery through Augmentor

The store should still keep the Registry as the trust layer.

## Living Archive Application

For the Living Archive, this pattern can help users explore their memory.

Archive discovery could support:

- semantic search across trusted AI Memory
- map of places and communities in Human Knowledge or External Knowledge
- timeline of documents, memories, projects, and decisions
- graph of people, concepts, claims, sources, and protocols
- filters for ownership domain: Human Knowledge, External Knowledge, AI Memory, Mixed Library

This should not replace the LLM Wiki. It is a navigation surface over it.

## ResonantDAO And Community Discovery

ResonantDAO is expected to govern a community of communities. The Glocal Discovery Interface can later become a way to find, understand, and connect with communities across the Resonant ecosystem.

Possible future uses:

- discover communities by location, theme, mission, language, capability, project, or governance model
- map local and global community activity without exposing private user location by default
- show a timeline of community events, proposals, releases, campaigns, and milestones
- filter communities by trust/provenance state, membership requirements, contribution type, and DAO relationship
- graph relationships between communities, projects, add-ons, contributors, proposals, and shared resources
- allow Augmentor to help a user find the right community, understand norms, and prepare a contribution or introduction

This is an idea to explore after the Alpha. It should not pull focus from the current ResonantOS core, Living Archive, provider fabric, and add-on foundation.

## Glocal Music Add-on

Glocal Music can become a showcase add-on for ResonantOS.

V1 add-on scope could include:

- artist/catalog directory
- music/news/event discovery
- advanced search with mood/function/location/time filters
- map and timeline exploration
- media previews
- playlist or collection generation
- community and account-role concepts
- optional commerce hooks after wallet/store infrastructure exists

The add-on should be built as a domain-specific implementation of the Glocal Discovery Interface, not as a special-case core feature.

## Design Principles

- Search, map, and timeline must work together, not as disconnected pages.
- Users should be able to move from exploration to action.
- AI should help refine filters, explain results, and create saved views.
- Visual richness must not hide trust, provenance, permissions, or payment state.
- The interface must work on desktop and touch screens.
- Private user data must stay inside the Portable User State Root.

## Open Questions

- Should the map/timeline engine be a core UI primitive or an SDK component available to add-ons?
- Should Glocal Music be first-party, personal, or community-owned?
- Which map provider should be used without compromising privacy?
- Which datasets are safe for public showcase without using private user data?
- How should AI-generated playlists, collections, or recommendations be audited?
