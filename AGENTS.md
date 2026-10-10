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
link; no upload or synchronization is implied. On event pages, the first navigation control is a labelled house button to the
group hub; the event overview uses a calendar icon and the label Übersicht.
Keep no large logo or category icon above the event's status.

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

On the hub, show the next confirmed event once in the hero and exclude it from
the cards below. The hero may only use that event's cover or program photo,
never a fallback image from another destination. Keep the mobile header compact.

Use Vorschlag for the visible planning status and Veranstaltung vorschlagen for
creating events. Keep Termin steht for confirmed dates. Internal status values
remain planning/confirmed/saved. House + Hauptseite always links to the group
hub; calendar + Übersicht links to the current event, with text labels alongside
icons so the two destinations remain clear on phones.

Returning members can log in with their nickname or full name plus the group
code. Resolve names only on the server after validating the code; reject
ambiguous aliases. Preserve the canonical nickname, stable roster key, votes
and organizer rights. Login fields allow 100 characters; new nicknames stay
limited to 50. Never retrieve private profiles in the unauthenticated frontend.

Personal settings are centralized at einstellungen.html in this group hub.
Every event links there using the event query parameter for its return link.
Keep the legacy Kufstein settings redirect working, including auth query and
hash parameters, because existing confirmation emails may target that URL.
Name/nickname changes synchronize group_people, group_members and own profile;
never expose another member's email in the group directory. Directory management
is protected on the server by group_private.admins and uses stable roster keys,
so account recovery preserves the role. Only an administrator edits others'
names; ordinary members edit their own profile. Do not grant admin roles through
the browser or infer them from display names at runtime. Preserve votes and
attendance when renaming, and reject stale admin edits. Admin management currently
covers names and nicknames; it does not delete accounts or change trip participation.
