# Geiladachtzger excursion website standard

All future excursions use the same shared website template: event.html, app.js,
trip-program.js and styles.css. Create a group_events record, not a copied
per-destination HTML page or a new layout. Cards in the group hub must route
to that shared event page. Kufstein 2026 keeps its existing dedicated page
and confirmed bookings; do not silently migrate its data.

Apply layout improvements centrally so existing and future shared excursion
pages stay consistent. The common structure is a destination photo header, then
three primary tabs: Reiseinfos, Programm, Gruppe. Reiseinfos contains Unterkunft &
Reiseinfos with separate arrival, departure and hotel fields. Gruppe has the
full-width participation area; never squeeze participants beside hotel or costs.
The view query creates linkable subpages without copying destination HTML; keep
uebersicht as the Reiseinfos route for compatibility. Program contains the
automatic itinerary and activity votes. Termine remains a secondary view linked
from the planning notice, available only while planning. Fotos is reached once
from the photo header, not repeated as a primary tab or an overview shortcut.
It opens the existing album page; no upload or synchronization is implied.
On event pages, the first navigation control is a labelled house button to the
group hub.
Keep no large logo or category icon above the event's status.

Destination covers and structured travel/hotel/album fields live in group_events.
An explicit cover wins; otherwise use the first existing program photo. Always
show photo credits/source links and retain a usable fallback for missing images.

The event creator edits event metadata and saves/resumes/deletes an event.
The existing group administrator also has small field pencils on all shared
event pages, through the narrow save_event_content_fields RPC. This does not
grant lifecycle or ownership changes, or alter existing member permissions.
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
Members can add ideas and links. Only a program item’s creator and the group
administrator may edit its content, including title, category, description,
times, costs, primary link and photos. Match the field pencils and media-editor
controls to this rule; enforce it in the RPC and direct table UPDATE policy.
Use created_by_key with the stable roster key, never a display name.
Creators can also delete their own program items; the existing administrator can
delete any item. Enforce this through DELETE RLS with can_edit_program, including
recovered member identities. Require a named-item confirmation explaining that
its votes and links are deleted too, but external bookings are not cancelled.
Do not delete real activities as a test. After successful deletion update the
activity list and itinerary; denied or failed deletion must keep the item visible.

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
hub; Reiseinfos links to the current event overview. Keep the primary labels
short enough to fit three tabs on phones.

Returning members sign in through member-code-login using nickname, full name,
or saved/verified email plus an individually changeable code. This also applies
to the administrator by explicit user request. The user chose a common initial
code; changing it in settings affects only that member. Store salted bcrypt
hashes privately and never expose email aliases, codes or service credentials.
The server function verifies the caller Auth token, validates the member code
and limits failed attempts. Confirmed-email accounts keep their original user ID:
issue a one-use Auth token without sending an email, then verify it in the client.
Never move a verified email/admin account to an anonymous identity. Preserve the
stable roster, votes and organizer rights for other member recovery. The legacy
recovery RPC is retired; do not allow it to bypass failed-attempt limits.
Settings require the current code, new code and confirmation; allow 4–64 characters.
The optional email-link path remains available. Login identifiers allow 254
characters; names and newly created nicknames retain their profile limits.

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

The hub prioritizes its next confirmed event, photos, then upcoming proposals
with their date polls. Each proposal has one card with a direct voting link and
a program/overview link. Avoid repeating it in a second event grid. Show a
four-item, non-scrolling mobile navigation: Events, Termine, Fotos, Gruppe.
Personal settings are reached through the user's name and gear. Members remain
on the hub inside a collapsed details section; direct #mitglieder links open it.
Hide the past-events section when empty. Keep archives compact.

Date voting uses a direct comparison list with weekdays, own-answer progress,
yes/maybe/no controls, and group counts. Calendar is an optional collapsed view
on the same dates subpage. Highlight leaders only after a positive vote, preserve
ties, and never confirm a date automatically. Ignore expired dates in progress
and leaders. Only the organizer finalizes dates. No personal-calendar or birthday
availability is implied by these member votes.

Photos stay prominent as one excursion hero shortcut and as the hub photo tab
and album area. Avoid duplicate photo links on the excursion overview. Destination covers are labelled as title images, not as images
retrieved from the private albums. All shared trips use the same photo view;
Kufstein keeps /kufstein-2026/fotos.html and its existing iCloud link. Do not imply
uploads or album synchronization. The album provider controls those permissions.

Navigation frames indicate only the current section or page. Never permanently
highlight Fotos or another destination. Use aria-current=location for the hub
and scrolling trip sections, updating on scroll; separate event views use
aria-current=page. All primary navigation links share the same inactive and
active appearance. Keep visible keyboard focus indicators independent of this.

All new and existing shared events inherit field pencils from event-field-editor.js.
Show event-level field pencils only to the administrator returned by the server.
Show program field pencils to the item’s creator and the administrator.
Use canonical group_events and group_program_items values, not duplicate text
overrides. Keep the 44px touch target with the small icon at the top right.
Save only the selected field or atomic schedule group and compare the original
values on the server. Preserve drafts after errors, and keep saved descriptions
and times consistent between program cards, itinerary and the hub.

Keep destination title images visible with explicit non-negative layers: photo 0,
overlay 1, content 2 and credits 3. Avoid negative z-index on cover images.
The current destination cover files are mirrored in assets/covers with their
original photo credits and official source URLs stored in group_events. Prefer
an explicit event cover, so editing a program photo does not remove the title image.
The hub's date-poll summary cards also render that event cover, with the same
own-event program-photo fallback, visible source credit and readable overlay.
Pass programItems to planningCards so new proposals inherit this behavior.

The Events hub link targets the featured next trip (#hub-hero). All excursion
pages share the sticky Reiseinfos/Programm/Gruppe navigation styling from
trip-navigation.css. Date planning is linked separately and disappears when
confirmed. Kufstein keeps its data and text keys, but trip-views.js presents
overview, program and group separately. Member cards show full names and only
distinct nicknames without a "Nickname:" prefix; omit nicknames repeating the
full or first name. Preserve explicit nickname labels in editable profile fields.
Participant cards have room for the own attendance selector, with normal word
wrapping and a stacked selector on narrow phones. Its legacy
abstimmung.html redirects to the program while preserving auth query/hash data.
Keep open date-voter details by stable option IDs across refreshes.
Program plan_status is idea/alternative/planned/booked. Only planned and booked
items form the firm itinerary; render suggestions separately and never promote
an item from votes alone. Preserve creator/admin authorization for status edits.
Explicit times sort first by time; clearly labelled morning/afternoon/evening
hints may guide ordering when times are absent, without displaying invented times.
cover-variants.js maps existing credited assets to generated responsive files;
unknown/new cover URLs must retain their original-image fallback.

Date votes keep focus in the originating calendar or comparison list after saving.
Responsive destination covers carry data-image-fallback for their original image;
image-fallback.js retries that HTTPS image once, removing srcset first. If both
fail, retain the readable card. Kufstein uses the same handler for its layered
header image and album cover; keep the visible source credit.
