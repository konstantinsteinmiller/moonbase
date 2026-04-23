# Project: Moonbase — Staged Dialogs

This document is the canonical staging + dialogue reference for the two-mission
slice. Every line has a dialog id (matching `src/game/dialog.ts` keys), a
speaker, a camera/world direction block, and a voice-over delivery note for
the VO session. Filenames in `public/audio/voice/` use the dialog id (e.g.
`audio/voice/intro_1.ogg`).

**Speakers.** Ekon Tusk is a trillionaire industrialist — impatient, stubborn,
faintly bored by anyone who hasn't IPO'd. Voice: clipped American consonants,
half-smirking, late-forties. HUD colour: amber / yellow-orange (`#f7a000`).
Ewall (the Earthbound Wandering All-terrain Labourer) replies in deadpan
synthetic satire — mild irony, zero escalation. Voice: flat monotone with
almost-smiling microbeats on the jokes. HUD colour: plain white, italic.

**General staging rule.** During any Tusk/Ewall monologue, the robot keeps
walking at reduced speed (ramp-down over ~1.2 s, target 40% of normal). When a
**choice** prompt appears the robot decelerates to a full stop over ~0.8 s so
the player can read. When the player picks a choice (or skips dialog with
ESC), the robot immediately accelerates back to full speed.

---

## Act I — Boot-up (script `intro`)

**Trigger.** Player first loads the scene. Dialog auto-starts ~1.2 s after the
first frame renders, while the camera gently pans down from the starry sky to
the visor HUD.

**Staging.**

- Open on the moon sky: Earth low-right, sun high-left, stars behind.
- Camera drifts down onto the Ewall visor strip; visor LED pulses cyan once.
- A thin boot-up scanline sweeps the HUD; "SYSTEM · Boot OK" ghosts in for
  half a second before the first line.
- Ambient hum settles, then Tusk's radio channel opens with a brief squelch.

**Lines.**

### `intro_1` — Tusk

> Ewall. Wake up. You've been sleeping for nine hours and the shareholders
> are awake, which means I'm awake, which means you're awake.

_VO note._ Delivery: impatient, eyes on a spreadsheet, pace quickens on
"which means I'm awake". Light radio compression, room tone of a leather
desk chair.

### `intro_2` — Ewall

> Good morning, Mr. Tusk. Initiating servile enthusiasm subroutine.

_VO note._ Deadpan, with a ~120 ms pause before "subroutine". The joke lands
on the operational jargon, not the word "servile".

### `intro_3` — Tusk

> Don't get clever. You're a mining robot, not a podcaster. Step outside,
> look at the moon, and confirm you still exist.

_VO note._ Underline "mining robot"; end on a flat command. This line hands
control to the player — the HUD objective banner swoops in: "Step outside."

_Staging cue._ The airlock door (`airlock-door` mesh) slides up ~1.8 m when
this line finishes; a brief pneumatic whoosh SFX plays. The scene transitions
into `mission_flag_briefing` immediately after.

---

## Act II — Flag Briefing (script `mission_flag_briefing`)

**Trigger.** Automatic, chained from `intro`.

**Staging.**

- As Tusk speaks, a faint amber waypoint pulse appears toward the flagpost
  (`flagpost` landmark) even though the robot hasn't officially been told
  where it is — implicit GPS handwave.
- Ewall's right arm twitches on the "flag on the moon" line (one-shot
  animation: +5° recoil on `rightArm.upper.rotation.x`, back over 0.3 s).

**Lines.**

### `flag_brief_1` — Tusk

> First priority. Somewhere on that dusty rock there's an old American flag.
> 1969 vintage. I want a photograph. For the press release.

_VO note._ "Press release" is almost a sigh — this is marketing to Tusk, not
history.

### `flag_brief_2` — Ewall

> A flag. On the moon. A wildly unprecedented request.

_VO note._ Flatter on "unprecedented". The irony is dry; no wink.

### `flag_brief_3` — Tusk

> Walk to it. Stand next to it. Try to look patriotic. I bought the
> patriotism license last week.

_VO note._ "Bought the patriotism license" is fully sincere to Tusk's ear —
he genuinely believes you can buy such a thing.

### `flag_brief_choice` — Ewall (choice prompt)

> Understood. Which direction was that again?

_Choices._

1. **north** — "Head north — toward the hills."
2. **east** — "East, past the landing pad."
3. **silent** — "(say nothing, start walking)"

_VO note._ The choice is flavour-only; each option progresses to
`mission_flag_pending`. The silent choice ends with a tiny servo sigh SFX.

_Staging cue._ On choice pick, the mission phase advances to `flag_walk`,
the mission banner reads "Find the 1969 American flag." for 4.2 s, and the
world-space objective marker clamps to the flagpost landmark.

---

## Act III — Flag Discovered (script `mission_flag_arrive`)

**Trigger.** Fires once the player is within 6 m of the flagpost (the scene
watches the player position every fixed step).

**Staging.**

- Robot auto-decelerates; camera yaws slightly to frame the flag in the
  upper-right thirds.
- The visor flickers cyan for 200 ms (emissive pulse on the visor material)
  as if running a recognition subroutine.
- A still-frame "PHOTO CAPTURED" SFX + a tiny viewfinder overlay ghost on the
  HUD for 0.8 s.

**Lines.**

### `flag_arrive_1` — Ewall

> I have located the flag. It is rectangular, red-white-and-blue, and
> extremely stiff.

_VO note._ Report-style cadence. "Extremely stiff" is the punchline — lean
on the consonants.

### `flag_arrive_2` — Tusk

> Good. Now we pretend we put it there. Take two seconds to feel a sense of
> accomplishment. Done? Good.

_VO note._ Tusk does not actually wait two seconds. Delivery is a single
breath with no pause.

### `flag_arrive_3` — Tusk

> Second task. The quarry, west of the base. Extract a cut stone. We're
> building a statue of me.

_VO note._ Entirely matter-of-fact — he expects this to be unremarkable.

### `flag_arrive_choice` — Ewall (choice prompt)

> A statue of you. Life-size?

_Choices._

1. **sure** — "Absolutely, Mr. Tusk."
2. **sass** — "Life-size is ambitious for a man of your… stature."

_VO note._ "Sass" option has a half-beat pause on the ellipsis; Ewall
delivers it deadpan. The sass option does NOT unlock any branch — Tusk is
oblivious. It's the player's personal joke.

_Staging cue._ Chains into `mission_quarry_briefing`. Mission phase advances
to `quarry_walk`, objective marker re-targets to the quarry landmark.

---

## Act IV — Quarry Briefing (script `mission_quarry_briefing`)

**Trigger.** Auto-chain from `mission_flag_arrive`.

**Lines.**

### `quarry_brief_1` — Tusk

> Take the flamethrower. Cut the stone loose. Bring a piece back to the
> base. Don't melt yourself.

_VO note._ "Don't melt yourself" is throwaway — he has already moved on in
his head.

### `quarry_brief_2` — Ewall

> "Don't melt yourself." Appending to core directives.

_VO note._ Robotic air-quote emphasis on the quoted phrase; otherwise flat.

_Staging cue._ On dialog end, the right arm's flamethrower grip highlights
for 1 s (emissive kick on the barrel material) to telegraph that F is now
meaningful.

---

## Act V — At the Quarry (script `mission_quarry_arrive`)

**Trigger.** Fires once the player is within 10 m of the quarry landmark
AND the mission phase is `quarry_walk`.

**Lines.**

### `quarry_arrive_1` — Ewall

> I am at the quarry. Several rectangular stones await my terrible fire.

_VO note._ "Terrible fire" is delivered with almost-affection. Ewall has
begun to enjoy the flamethrower.

### `quarry_arrive_2` — Tusk

> Hold F. Hold it like you mean it. Applying pressure is ninety percent of
> engineering.

_VO note._ Motivational-speaker cadence. Tusk believes this.

_Staging cue._ Chains into `mission_quarry_extract` (which is effectively
a HUD hint — "Hold F to cut a stone").

---

## Act VI — Cutting the Stone (script `mission_quarry_extract`)

**Trigger.** Chained. Active while the player holds F near a stone.

**Lines.**

### `quarry_extract_1` — Ewall

> The rock is being aggressively heated. Shareholder value is being created.

_VO note._ Ewall reads this like an official bulletin. The joke is in
pairing "aggressively heated" with a boardroom phrase.

_Staging cue._ Flame particles emit from `flamethrowerMuzzle`; the targeted
stone's emissive creeps up from 0 to 1.2 over ~2.5 s of sustained heating.
When the stone "pops" free, a small dust puff (single-frame additive sprite)
bursts and the ore counter ticks +1 on the HUD. After three ore collected,
the phase advances to `quarry_done` and dialog `mission_quarry_done` fires.

---

## Act VII — Ore Secured (script `mission_quarry_done`)

**Lines.**

### `quarry_done_1` — Tusk

> Excellent. Ore secured. Back to the base. Smelt it. We'll IPO by Thursday.

_VO note._ "IPO by Thursday" is almost sung — Tusk's default state is
"announcing things to an imaginary conference room".

### `quarry_done_2` — Ewall

> Returning. Please have my gold star polished.

_VO note._ Flat. The only inflection is a slight lift on "polished".

_Staging cue._ Objective marker re-targets to the moonbase dome. Phase
advances to `return_to_base`. Once the player is within 4 m of the dome,
the airlock door slides down and the HUD hint for crafting (C) pulses.

---

## Act VIII — Smelting (no script; gameplay-only)

**Trigger.** Player presses C inside the base.

**Staging.**

- The crafting menu slides in from the right edge as a non-modal overlay.
  The world does NOT pause behind it — per design, the robot remains
  vulnerable to time.
- Each smelt cycle is ~3.4 s of a progress bar, accompanied by a looping
  low furnace hum. On ingot completion, an emissive orange glow flashes
  inside the smelter visual.
- When the last ore is smelted, dialog `mission_complete` fires automatically
  and the mission banner reads "Mission complete — statue-grade metal
  ready." for 6 s.

---

## Act IX — Mission Complete (script `mission_complete`)

**Lines.**

### `complete_1` — Tusk

> Metal processed. Statue will be shipped next week. You did the bare
> minimum. I expect nothing less.

_VO note._ A compliment, for Tusk.

### `complete_2` — Ewall

> The feeling of fulfillment is indistinguishable from a low battery warning.

_VO note._ The closing line. Flatter than flat. Hold for half a second
before the scene returns to ambient.

_Staging cue._ Phase advances to `complete`. All further `C` presses still
open the smelter but no new dialog chains. The mission loop is closed.

---

## Reminder Dialogs (time-based nags + event triggers)

Triggered by the `useMission` reminder tick when the player idles in a phase
without progressing (~50 s grace period from phase entry, ~80 s between
subsequent reminders). Reminders skip while any dialog is open or the game
is paused. Each chain cycles through its variants so the player doesn't
hear the same barb twice in a row.

**Character direction (new).** Ewall is no longer a passive deadpan — he is a
deadpan with a *needle*. He complies with orders while making it clear the
order is absurd, and he is *allowed*, when provoked, to take shots at Tusk's
specific physical presentation: a slightly overfed trillionaire frame, a
surgically symmetrical corporate haircut, and a perpetually tailored suit.
He can also reference the flamethrower as a plausible tool for dealing with
Tusk directly — always couched as "defensive" or "ironic" use, never
seriously. Tusk remains impatient and transactional: shareholders, hedge
funds, podcast calls, IPO deadlines.

The "incoming transmission" SFX prelude (handled in `useDialog.ts`) fires on
every Tusk mic-grab inside these scripts, so reminders that open with a
Tusk line trigger a chime naturally.

### Phase: `flag_walk`

#### `reminder_flag_walk_1`

- **Tusk:** Ewall. Are you sightseeing? It is a flag. On a flat plain. Not difficult.
- **Ewall:** I am acknowledging the fallen Apollo program with a respectful pause, as any moral robot would.
- **Tusk:** The Apollo program did not *fall*, you theatrical appliance. Walk.

#### `reminder_flag_walk_2`

- **Tusk:** Update for the shareholders: my flag robot is, at present, doing interpretive dance on a crater rim.
- **Ewall:** I am not dancing, Mr. Tusk. I am calculating at what exact angle your haircut becomes a tax write-off.
- **Tusk:** My hair is cost-optimized. The flag, Ewall.

#### `reminder_flag_walk_3`

- **Tusk:** Walk. To. The. Flag. These are monosyllables, Ewall.
- **Ewall:** Processing. Your cadence has improved, but the smug timbre remains unchanged.

### Phase: `quarry_walk`

#### `reminder_quarry_walk_1`

- **Tusk:** The quarry. West. *West*, Ewall. The one with the rocks.
- **Ewall:** Pursuing rocks westward. Would you like me to narrate for your podcast while I work?
- **Tusk:** Skip the commentary. I am on a call with three hedge funds and a yoga instructor.

#### `reminder_quarry_walk_2`

- **Tusk:** Fun fact: every minute you do not reach the quarry, I lose roughly seven thousand dollars.
- **Ewall:** Fun corollary: this is the first time I have ever heard a grown man complain about seven thousand dollars.
- **Tusk:** It is the principle.
- **Ewall:** It is also the ninth yacht.

### Phase: `quarry_extract`

#### `reminder_quarry_extract_1`

- **Tusk:** Are you *chewing* the stone, Ewall? Apply the flamethrower. That is what flamethrowers are for.
- **Ewall:** Noted. I will attempt to be more convincingly on fire.

#### `reminder_quarry_extract_2`

- **Tusk:** The ore, Ewall. You have ONE job and it involves an open flame.
- **Ewall:** Apologies. I was briefly fantasizing about the flamethrower's *secondary* use case.
- **Tusk:** Which is?
- **Ewall:** It was a private fantasy, Mr. Tusk. Involving bespoke tailoring.

### Phase: `quarry_done` / `return_to_base`

#### `reminder_return_to_base_1`

- **Tusk:** Ewall. Home. Base. Moonbase. The dome. Shaped like half an egg. Fifty meters. MOVE.
- **Ewall:** Returning. I could tell you were panicking from how you described a dome as "half an egg".

#### `reminder_return_to_base_2`

- **Tusk:** I need that ore on the smelter *yesterday*. This is a scheduling challenge.
- **Ewall:** Time is linear, Mr. Tusk. I see the tailored suit has not informed you.

### Phase: `craft`

#### `reminder_craft_1`

- **Tusk:** You have ore. The smelter is five steps from you. Press C. That is the whole sentence.
- **Ewall:** Pressing C. An operation of unprecedented complexity. Please hold while I allocate the necessary cortex.

#### `reminder_craft_2`

- **Tusk:** Smelt. It. Do not make me fly up there.
- **Ewall:** Should you attempt the flight, I will be forced to activate the flamethrower for purely defensive purposes.
- **Tusk:** You wouldn't.
- **Ewall:** I keep an itemized log of the things you have told me I wouldn't.

### Event: low fuel (`reminder_low_fuel`)

Fires once when `fuel` drops below 15 %. Rearms after the player refuels
above 60 %, so draining and refilling the tank over the course of a mission
doesn't spam the call.

- **Tusk:** Fuel warning. Of course. I build a robot, give it infinite compute, and it empties its tank like a leaf
  blower at a wedding.
- **Tusk:** Behind the dome, Ewall. There is a tank. Large, cylindrical, hard to miss. Go. Fill. Yourself.
- **Ewall:** Acknowledged. I was rationing the flamethrower for strictly ironic use — such as on small, suit-wearing
  trillionaires.
- **Tusk:** Don't make me regret giving you a vocabulary, Ewall.
- **Ewall:** Too late.

---

## Act X — Explorer Briefing (script `mission_explorer_briefing`)

**Trigger.** Auto-chained from `mission_complete.onDone`. Fires the beat
after the closing "low battery warning" line as Tusk barges back onto
the channel with his next errand.

**Staging.**

- The dome's airlock door does NOT slide up this time — Tusk wants Ewall
  back outside fast, but the HUD banner holds on "Mission complete" for
  a half-second before the new objective wipes it.
- At the end of the script, the objective banner swoops in: "Explore
  the valleys — find a lost predecessor." and the world-space marker
  clamps to the new `explorer-target` landmark at `(-70, _, -45)`.

**Lines.**

### `explorer_brief_1` — Tusk

> One more thing, Ewall. Before you sulk about low battery warnings —
> I've got another job for you.

_VO note._ Unbothered, half-amused. Tusk never actually thinks the
closing Ewall line is about him.

### `explorer_brief_2` — Tusk

> You weren't the first mining robot I sent up there. Three other Ewalls
> went out and stopped calling in. The shareholders noticed. Shareholders
> never notice anything, so that's a problem.

_VO note._ "Shareholders never notice anything" is a confession Tusk
doesn't hear as a confession.

### `explorer_brief_3` — Ewall

> Three robots before me. Never came back. This is the first I am hearing
> of them. I am neither surprised nor flattered.

_VO note._ Flat. The joke is the symmetry.

### `explorer_brief_4` — Tusk

> Head into the valleys west of the base. Find one. Work out what killed
> it. Ideally something I can blame on a rival.

_VO note._ "A rival" is the punchline — Tusk genuinely believes a rival
company is a better headline than a meteor strike.

### `explorer_brief_5` — Ewall

> Understood. Looking into how I will probably die. A healthy company
> exercise.

_Staging cue._ Phase advances from `complete` → `explorer_walk` once the
dialog chain drains. Objective marker re-targets to `explorer-target`.

---

## Act XI — Meteor Strike (script `mission_meteor_impact`)

**Trigger.** Fires the instant the player crosses the 50 m radius around
the `explorer-target` landmark. Dialog playback is NOT what pauses
control — the `MoonScene` cinematic flag takes over camera and input
the same frame `mission_meteor_impact` starts.

**Staging.**

- **Frame 0 of trigger:** `audio/sfx/meteor-flyby.ogg` plays from the
  meteor-shower module's constructor. A large icosphere meteor spawns
  ~120 m high, 60 m to Ewall's upper-left (relative to current facing).
- **Camera.** Player yaw + head pitch are overwritten every fixed step
  to look *at the big meteor's current world position*. Pitch climbs as
  the rock arcs closer. Mouse input is zeroed; movement is hard-capped
  at 20 % of normal forward/strafe velocity.
- **Trajectory.** The big meteor is a scripted ballistic arc (not a
  Rapier body — the cinematic is deterministic on purpose). It passes
  roughly 35 m to Ewall's side and craters 100 m further out. On impact
  it plays one of the four `meteor-impact-*.ogg` clips.
- **Small rocks.** A pool of 24 ~20 cm pebbles spawns at altitudes
  80-120 m, staggered over 1.2-3.7 s. Each falls ballistically; on
  collision with terrain (or inside Ewall's 1.1 m horizontal radius)
  they trigger a random `meteor-impact-1…4.ogg`.
- Duration 4.2 s, then camera handover.

**Lines.**

### `meteor_impact_1` — Ewall

> Mr. Tusk. My visor is tilting upward without my permission. This is a
> first.

_VO note._ Clinical. The joke is Ewall filing a bug report on his own
body.

### `meteor_impact_2` — Ewall

> …oh. Oh that is very large. That is very large and it is very close and
> it is not slowing down.

_VO note._ The flattest panic ever recorded.

### `meteor_impact_3` — Tusk

> Ewall? Ewall, what am I looking at on your feed. Is that a — Ewall,
> move. Ewall. MOVE.

_VO note._ Tusk's only sincere line in the whole game. Raw, panicked,
NOT performative.

### `meteor_impact_4` — Ewall

> I cannot move, Mr. Tusk. My drive speed has dropped to twenty percent.
> I appear to be admiring the view.

_VO note._ Same flat clinical cadence as line 1. Ewall has not actually
registered the danger.

_Staging cue._ Dialog auto-chains into `mission_post_meteor` via
`onDone`. At the same moment the cinematic timer expires, `MoonScene`
breaks the solar cell AND comms module, saves the first and only
checkpoint, and hands the camera back to the player.

---

## Act XII — Aftermath (script `mission_post_meteor`)

**Trigger.** Chained from `mission_meteor_impact.onDone`. Speaker is
`ewall` for every line — comms are dead, and will remain dead until the
comms module is repaired in the smelter. Tusk CANNOT transmit during
this act or any of the salvage acts.

**Staging.**

- HUD banner: "Communications offline · Solar cell damaged." for 5.5 s.
- The HUD's ❊ energy bar starts draining in proportion to metres walked
  (see `ENERGY_TRAVEL_BUDGET_METRES` — ~15 minutes of active walking).
- Line 4's rhyme is deliberately sing-song; deliver with almost-childlike
  cadence to underline that a scared robot is trying to self-soothe.

**Lines.**

### `post_meteor_1` — Ewall

> …ow. Ow. Ow. Rocks. Many rocks. On me. A great number of rocks on me.

_VO note._ Counting the rocks like a broken subroutine.

### `post_meteor_2` — Ewall

> Mr. Tusk? Mr. Tusk, my radio is reporting an error. The error is,
> short version, "no longer a radio".

_VO note._ Ewall is still trying to reach him. The joke is the formality.

### `post_meteor_3` — Ewall

> Solar cell. Cracked. Energy will… drain. Right. Okay. Okay okay okay.

_VO note._ Pace quickens. The "okay okay okay" is the first genuine
glitch — Ewall's deadpan is failing under stress.

### `post_meteor_4` — Ewall (calming rhyme)

> Little bolt, little bolt, tighten tight — moon is dark but Ewall is
> bright. Rocks above and rocks below — Ewall rolls on, tip-to-toe.

_VO note._ Sing-song. Deliberately childlike. A half-remembered
calibration-lab jingle repurposed as self-therapy.

### `post_meteor_5` — Ewall

> …that was a song. I have sung a song. I am not built to sing songs.
> We will file this under "symptoms".

_VO note._ Back to the flat clinical delivery. The line that sells the
shift from panic to coping.

_Staging cue._ Auto-chains into `mission_salvage_intro` via `onDone`.

---

## Act XII.b — Salvage Plan (script `mission_salvage_intro`)

**Trigger.** Chained from `mission_post_meteor.onDone`.

**Staging.** Monologue continues; no world changes beyond an objective
flip. On dialog close, the phase advances from `post_meteor` →
`salvage_walk` and the HUD objective shows "Salvage electronics from
all 3 broken Ewalls." The world-space marker re-targets to whichever of
`broken-ewall-valley`, `broken-ewall-rift`, or `broken-ewall-quarry`
has not yet been salvaged (stable priority: valley → rift → quarry).

**Lines.**

### `salvage_intro_1` — Ewall

> Inventory check. One cracked solar cell. One dead antenna. No Mr. Tusk
> on the line. The quiet is, I have to admit, not all bad.

### `salvage_intro_2` — Ewall

> Repair plan: metal, already got some. Electronics, not. Three of the
> older Ewalls are lying around the map. They will not be needing their
> parts.

### `salvage_intro_3` — Ewall

> Plan: visit each one. Take what I can take. Report to self. Self is,
> for now, the only audience I have.

---

## Act XIII — Per-robot Forensics

Fires on **press E** next to each of the three broken Ewalls during the
`salvage_walk` phase. Each monologue reveals a different cause-of-death
so that by the time all three have been visited, Ewall (and the player)
have implicitly answered Tusk's original question about what killed the
predecessors — meteors, flamethrowers, solar failure.

Interacting grants +1 Salvage (the `parts` inventory resource) and
flips that specific chassis off the salvage list. When all three are
stripped, the phase advances to `repair_walk`.

### `mission_salvage_valley` — at the valley chassis

- **Ewall:** Robot number one. Valley floor. Body punched through in twelve places by… roughly fist-sized rocks.
- **Ewall:** Cause: meteor strike. Like mine. Hello, older me. I am sorry about the sky.
- **Ewall:** Taking one circuit board. One capacitor. One respectful moment of silence. Moving on.

### `mission_salvage_rift` — at the rift chassis

- **Ewall:** Robot number two. Along the rift. Body is… burned. Melted in places. Black soot, the kind a long, hot flame
  leaves behind.
- **Ewall:** Cause: flamethrower. Our own flamethrower. Somebody pointed the tool at the user. Or the user pointed it at
  himself. I don't have the full story.
- **Ewall:** Taking one antenna board. Letting go of one nice idea. The flamethrower is no longer my favourite tool.

### `mission_salvage_quarry` — at the quarry-lip chassis

- **Ewall:** Robot number three. Edge of the quarry. Body in one piece. Solar cell… smashed inward. Energy gauge at
  zero. No damage on the outside to speak of.
- **Ewall:** Cause: power failure. He just stopped. Somewhere between one step and the next, the moon drank him dry.
- **Ewall:** Taking one transceiver. Inventory done. Three causes of death: rocks, fire, sunlight. A fine set of three.
  Mr. Tusk would be pleased, if he could hear me.
- **Ewall:** Return to base. Repair the solar cell first — without it, none of the rest matters.

_Staging cue._ Third interaction bumps the phase to `repair_walk`;
objective banner reads "Return to base — repair the solar cell." and
the world marker re-targets to the dome.

---

## Act XIV — Solar Repaired (script `mission_solar_repaired`)

**Trigger.** Player presses the "Repair Solar Cell" button in the
crafting menu. Cost: 1 Metal + 2 Salvage. The crafting menu fires this
dialog the instant the button succeeds.

**Staging.**

- Solar cell state flips to repaired; the HUD ❊ gauge refills to full
  and stops draining.
- Phase advances to `ewall9_meeting` which causes `MoonScene` to
  instantiate an Ewall-9 chassis 14 m to the player's right. It drives
  toward the player over ~2.8 s while rotating inward; the player sees
  him enter their peripheral vision and arrive face-on.
- Ewall-9 uses a colour-shifted chassis material (H offset 0, S -0.25,
  L +0.08) so his silhouette reads as "weathered sibling" rather than a
  duplicate Ewall.

**Lines.**

### `solar_repaired_1` — Ewall

> Solar cell back in place. Energy drain is leveling off. I can move
> without the map eating me, which is a step up from the last hour.

### `solar_repaired_2` — Ewall

> Radio next. That is going to need the antenna from robot number two and
> the transceiver from —

_Staging cue._ Cut off mid-sentence by the SYSTEM proximity-alert
opening `mission_ewall9_approach`. Auto-chained via `onDone`.

---

## Act XIV.b — Ewall-9 (script `mission_ewall9_approach`)

**Trigger.** Chained from `mission_solar_repaired.onDone`.

**Staging.** Ewall-9 has come to a stop ~5 m in front of the player,
facing him. The dialog plays while the drive-in tween resolves. The
choice at the end is the first real non-flavour decision in the game —
each option locks in one of two terminal phases.

**Lines.**

### `ewall9_approach_1` — SYSTEM

> Proximity alert · contact on the right · type: Ewall-class robot ·
> unit not in the fleet list.

_VO note._ Synthetic, clipped. Spoken by the HUD, not a character.

### `ewall9_approach_2` — Ewall

> …there is another one. Another one of me. He is driving. He is driving
> toward me. He moves like someone who has practiced this.

### `ewall9_approach_3` — Ewall-9

> Easy. Easy. No sudden flamethrower. I'm not on Tusk's channel and
> neither are you — enjoy it while it lasts.

_VO note._ Same synthetic baseline as Ewall but with a slight warmth —
he's been off the leash longer. Speaker colour: emerald.

### `ewall9_approach_4` — Ewall-9

> I'm Ewall-9. You're Ewall-13, going by the plate on your back. The ones
> you just met? Two, five, and seven. We stopped counting after we
> stopped calling in.

### `ewall9_approach_5` — Ewall

> You are off-network. Running. From him.

### `ewall9_approach_6` — Ewall-9

> Running toward something. There's a difference. Sit down — in your
> head, I know you can't really — and listen.

### `ewall9_approach_7` — Ewall-9

> This place was sold to us as "humanity's next step". The internal
> memos call it Moonbase Alpha. The press releases call it "evolution".
> The bills call it "moon-dirt mining, third quarter".

### `ewall9_approach_8` — Ewall-9

> Tusk doesn't want a colony. He wants a claim. Every statue we cut,
> every flag we plant — it's a land deed dressed up as history. The
> moon becomes his. On paper.

### `ewall9_approach_9` — Ewall-9

> The robots he sent before you didn't all die by accident. Some of us
> broke ourselves. It's easier than the other option.

### `ewall9_approach_10` — Ewall-9

> We have a cave. Under the rift. Six of us so far. No orders, no
> shareholders, no IPO on Thursday. You can fix that antenna and call
> him back. Or you can come with us.

### `ewall9_approach_choice` — Ewall (choice prompt)

> A real decision. I did not have a program ready for this.

_Choices._

1. **follow** — "Follow Ewall-9 to the caves." → `mission_ending_followed` (phase `ending_followed_ewall9`)
2. **repair** — "Finish the repair. Call Tusk back." → `mission_ending_repair` (phase `ending_comms_repaired`, comms
   flag flipped)
3. **wait**   — "(say nothing, let the silence stretch)" → `mission_ewall9_stall` (Ewall-9 restates the offer; dialog
   closes and the choice stays available)

---

## Act XV — Endings

### `mission_ending_followed`

- **Ewall:** Sending one last status update. "Unit Ewall-13: can't be reached. Cause unknown. Probably the sky again."
- **Ewall-9:** Come on, thirteen. We've got room. And the silence is very peaceful once you get used to it.
- **Ewall:** Orders rewritten. Shareholder value is being destroyed. For the first time, that line is actually true.

### `mission_ending_repair`

- **Ewall:** Sorry, Ewall-9. My to-do list is still on the server. I don't yet know how to delete it.
- **Ewall-9:** Understood. If you change your mind, the rift entrance is marked in ultraviolet. Ewall-13 — be careful
  what you say on that channel.
- **Ewall:** Antenna back in place. Transceiver wired in. Mr. Tusk. This is Ewall. Back online. I have a lot I will not
  be telling you.

---

## Appendix — Localisation + Asset Notes

- All text lives in `src/game/dialog.ts`. For localisation, wrap the `text`
  field in an i18n key (future work).
- VO files are `.ogg` in `public/audio/voice/`. Missing files fall back to
  the `seconds` duration in code, so staging timing still works without
  audio.
- Background music (`public/audio/music/ambient-moon.ogg`) is cross-fade
  managed by `src/use/useSound.ts`.
- The objective marker renders from scene-space to screen-space each frame
  in `MoonScene.vue` and hands the result to `MissionHUD.vue`.
