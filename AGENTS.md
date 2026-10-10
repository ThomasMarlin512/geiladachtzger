# Geiladachtzger excursion website standard

All future excursions use the same shared website template: event.html, app.js,
trip-program.js and styles.css. Create a group_events record, not a copied
per-destination HTML page or a new layout. Cards in the group hub must route
to that shared event page. Kufstein 2026 keeps its existing dedicated page
and confirmed bookings; do not silently migrate its data.

Apply layout improvements centrally so existing and future shared excursion
pages stay consistent. The common structure is a destination photo header, then four views in the same
shared template: Übersicht, Programm & Abstimmung, Termine, Fotos. The view query
parameter creates linkable event subpages without copying destination HTML.
Overview contains separate arrival, departure, hotel and participation fields.
Program contains the automatic itinerary and activity votes. Dates and calendars
appear only on the Termine view while planning. Photos opens an external album
link; no upload or synchronization is implied. Keep the small navigation logo,
but no large logo or category icon above the event's planning status.

Destination covers and structured travel/hotel/album fields live in group_events.
An explicit cover wins; otherwise use the first existing program photo. Always
show photo credits/source links and retain a usable fallback for missing images.

Only the event creator edits event metadata or saves/resumes/deletes an event.
Saved events have status=saved, appear separately on the hub and retain all votes,
program and dates. Resume preserves an already chosen date. A delete needs an
explicit typed-title confirmation explaining cascaded data loss; never delete
real events as a test. Keep the dedicated Kufstein event protected from deletion
in the shared hub. Backend RLS remains authoritative, including anonymous-auth
members that joined the group.

Every program item supports multiple source links, optional trip day,
start/end times (including an explicit next-day end), and a selectable
photo with a source link and credit. Store destination content and photos
in Supabase; do not hardcode destination-specific photo maps in the template.
Members can add ideas and links and edit the specifically permitted description, time
and photo fields. Preserve the existing row and column permissions.

Photo suggestions are fetched through the authenticated program-link-preview
Edge Function. Keep membership authorization, validated public HTTPS targets,
DNS pinning, redirect validation, response size and timeout limits. Do not
forward Supabase credentials to destination websites. Failed previews must
leave the direct image URL option usable; photos are only applied on Save.

Keep the layout usable on phones. Escape user content and allow only HTTPS
URLs without credentials. Preserve member votes when changing content.
Run the relevant tests in tests/ for template, time, image and preview changes.

Generate the itinerary directly from current program records on every refresh.
Sort by trip day and start time, display descriptions and from/to times, and
provide editing from both the activity card and itinerary. Keep missing times
explicitly open; do not invent a confirmed schedule or treat votes as bookings.
