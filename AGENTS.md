# Geiladachtzger excursion website standard

All future excursions use the same shared website template: event.html, app.js,
trip-program.js and styles.css. Create a group_events record, not a copied
per-destination HTML page or a new layout. Cards in the group hub must route
to that shared event page. Kufstein 2026 keeps its existing dedicated page
and confirmed bookings; do not silently migrate its data.

Apply layout improvements centrally so existing and future shared excursion
pages stay consistent. The common structure is: group branding and trip
header, activity cards with voting, itinerary, travel information, date poll
while planning, and participants. A confirmed date hides the calendar and
its navigation entry without hiding program voting.

Every program item supports multiple source links, optional trip day,
start/end times (including an explicit next-day end), and a selectable
photo with a source link and credit. Store destination content and photos
in Supabase; do not hardcode destination-specific photo maps in the template.
Members can add ideas and links and edit the specifically permitted time
and photo fields. Preserve the existing row and column permissions.

Photo suggestions are fetched through the authenticated program-link-preview
Edge Function. Keep membership authorization, validated public HTTPS targets,
DNS pinning, redirect validation, response size and timeout limits. Do not
forward Supabase credentials to destination websites. Failed previews must
leave the direct image URL option usable; photos are only applied on Save.

Keep the layout usable on phones. Escape user content and allow only HTTPS
URLs without credentials. Preserve member votes when changing content.
Run the relevant tests in tests/ for template, time, image and preview changes.
