/**
 * Dialog data + state for Project: Moonbase.
 *
 * Each dialog is a sequence of lines. Lines are spoken by either Ekon Tusk
 * (the impatient trillionaire — yellow/orange text) or Ewall (the deadpan
 * robot — white text with a small satire marker). Some lines are "choice"
 * nodes: the player picks a response and the mission state branches.
 *
 * Voice lines are preloaded as `.ogg` files in `public/audio/voice/` keyed by
 * line id. Missing files simply silently play nothing — the text still runs.
 */

export type Speaker = 'tusk' | 'ewall' | 'system' | 'ewall9'

export interface DialogLine {
  id: string
  speaker: Speaker
  /** Localised text key OR raw text (we default to raw for now). */
  text: string
  /** Suggested read time in seconds; voice line overrides this when present. */
  seconds: number
  /** When non-empty, the line is a choice node; player picks one reply.
   *  `reaction` drives a short post-pick whistle SFX from Ewall: 'snappy'
   *  plays a cheeky exited whistle after a zinger, 'silent' plays the bored
   *  whistle when the player declines to comment. */
  choices?: { id: string; text: string; nextDialog?: string; reaction?: 'snappy' | 'silent' }[]
  /** When the line finishes playing and the next line isn't a choice, the next
   *  dialog to auto-chain into (optional — usually sequential in the array). */
  nextDialog?: string
}

export interface DialogScript {
  id: string
  lines: DialogLine[]
  /** Called after the final line resolves, typically to advance mission state. */
  onDone?: string
}

// Helper for the VO filename a line would use.
export const voiceLinePath = (id: string) => `audio/voice/${id}.ogg`

// -- Scripts ------------------------------------------------------------------

export const DIALOGS: Record<string, DialogScript> = {
  intro: {
    id: 'intro',
    onDone: 'mission_flag_briefing',
    lines: [
      {
        id: 'intro_1',
        speaker: 'tusk',
        text: `Ewall. Wake up. You've been sleeping for nine hours and the shareholders are awake, which means I'm awake, which means you're awake.`,
        seconds: 6
      },
      {
        id: 'intro_2',
        speaker: 'ewall',
        text: `Good morning, Mr. Tusk. Initiating servile enthusiasm subroutine.`,
        seconds: 3.5
      },
      {
        id: 'intro_3',
        speaker: 'tusk',
        text: `Don't get clever. You're a mining robot, not a podcaster. Step outside, look at the moon, and confirm you still exist.`,
        seconds: 5
      }
    ]
  },

  mission_flag_briefing: {
    id: 'mission_flag_briefing',
    onDone: 'mission_flag_pending',
    lines: [
      {
        id: 'flag_brief_1',
        speaker: 'tusk',
        text: `First priority. Somewhere on that dusty rock there's an old American flag. 1969 vintage. I want a photograph. For the press release.`,
        seconds: 6
      },
      {
        id: 'flag_brief_2',
        speaker: 'ewall',
        text: `A flag. On the moon. A wildly unprecedented request.`,
        seconds: 3.5
      },
      {
        id: 'flag_brief_3',
        speaker: 'tusk',
        text: `Walk to it. Stand next to it. Try to look patriotic. I bought the patriotism license last week.`,
        seconds: 5
      },
      {
        id: 'flag_brief_choice',
        speaker: 'ewall',
        text: `Understood. Which direction was that again?`,
        seconds: 3,
        choices: [
          { id: 'north', text: 'Head north — toward the hills.' },
          { id: 'east', text: 'East, past the landing pad.' },
          { id: 'silent', text: '(say nothing, start walking)', reaction: 'silent' }
        ]
      }
    ]
  },

  mission_flag_pending: {
    id: 'mission_flag_pending',
    lines: [
      {
        id: 'flag_nudge_1',
        speaker: 'tusk',
        text: `Are you walking yet? The press release has a deadline and that deadline was thirty minutes ago.`,
        seconds: 5
      }
    ]
  },

  mission_flag_arrive: {
    id: 'mission_flag_arrive',
    onDone: 'mission_quarry_briefing',
    lines: [
      {
        id: 'flag_arrive_1',
        speaker: 'ewall',
        text: `I have located the flag. It is rectangular, red-white-and-blue, and extremely stiff.`,
        seconds: 5
      },
      {
        id: 'flag_arrive_2',
        speaker: 'tusk',
        text: `Good. Now we pretend we put it there. Take two seconds to feel a sense of accomplishment. Done? Good.`,
        seconds: 6
      },
      {
        id: 'flag_arrive_3',
        speaker: 'tusk',
        text: `Second task. The quarry, west of the base. Extract a cut stone. We're building a statue of me.`,
        seconds: 6
      },
      {
        id: 'flag_arrive_choice',
        speaker: 'ewall',
        text: `A statue of you. Life-size?`,
        seconds: 3,
        choices: [
          { id: 'sure', text: 'Absolutely, Mr. Tusk.' },
          { id: 'sass', text: `Life-size is ambitious for a man of your… stature.`, reaction: 'snappy' }
        ]
      }
    ]
  },

  mission_quarry_briefing: {
    id: 'mission_quarry_briefing',
    lines: [
      {
        id: 'quarry_brief_1',
        speaker: 'tusk',
        text: `Take the flamethrower. Cut the stone loose. Bring a piece back to the base. Don't melt yourself.`,
        seconds: 5
      },
      {
        id: 'quarry_brief_2',
        speaker: 'ewall',
        text: `"Don't melt yourself." Appending to core directives.`,
        seconds: 3.5
      }
    ]
  },

  mission_quarry_arrive: {
    id: 'mission_quarry_arrive',
    onDone: 'mission_quarry_extract',
    lines: [
      {
        id: 'quarry_arrive_1',
        speaker: 'ewall',
        text: `I am at the quarry. Several rectangular stones await my terrible fire.`,
        seconds: 4.5
      },
      {
        id: 'quarry_arrive_2',
        speaker: 'tusk',
        text: `Hold F. Hold it like you mean it. Applying pressure is ninety percent of engineering.`,
        seconds: 5
      }
    ]
  },

  mission_quarry_extract: {
    id: 'mission_quarry_extract',
    lines: [
      {
        id: 'quarry_extract_1',
        speaker: 'ewall',
        text: `The rock is being aggressively heated. Shareholder value is being created.`,
        seconds: 4
      }
    ]
  },

  mission_quarry_done: {
    id: 'mission_quarry_done',
    lines: [
      {
        id: 'quarry_done_1',
        speaker: 'tusk',
        text: `Excellent. Ore secured. Back to the base. Smelt it. We'll IPO by Thursday.`,
        seconds: 5
      },
      {
        id: 'quarry_done_2',
        speaker: 'ewall',
        text: `Returning. Please have my gold star polished.`,
        seconds: 3.5
      }
    ]
  },

  mission_complete: {
    id: 'mission_complete',
    onDone: 'mission_explorer_briefing',
    lines: [
      {
        id: 'complete_1',
        speaker: 'tusk',
        text: `Metal processed. Statue will be shipped next week. You did the bare minimum. I expect nothing less.`,
        seconds: 6
      },
      {
        id: 'complete_2',
        speaker: 'ewall',
        text: `The feeling of fulfillment is indistinguishable from a low battery warning.`,
        seconds: 5
      }
    ]
  },

  // -- Act X: a new mission — locate a missing predecessor -----------------
  mission_explorer_briefing: {
    id: 'mission_explorer_briefing',
    lines: [
      {
        id: 'explorer_brief_1',
        speaker: 'tusk',
        text: `One more thing, Ewall. Before you sulk about low battery warnings — I've got another job for you.`,
        seconds: 5.5
      },
      {
        id: 'explorer_brief_2',
        speaker: 'tusk',
        text: `You weren't the first mining robot I sent up there. Three other Ewalls went out and stopped calling in. The shareholders noticed. Shareholders never notice anything, so that's a problem.`,
        seconds: 9
      },
      {
        id: 'explorer_brief_3',
        speaker: 'ewall',
        text: `Three robots before me. Never came back. This is the first I am hearing of them. I am neither surprised nor flattered.`,
        seconds: 6.5
      },
      {
        id: 'explorer_brief_4',
        speaker: 'tusk',
        text: `Head into the valleys west of the base. Find one. Work out what killed it. Ideally something I can blame on a rival.`,
        seconds: 7
      },
      {
        id: 'explorer_brief_5',
        speaker: 'ewall',
        text: `Understood. Looking into how I will probably die. A healthy company exercise.`,
        seconds: 5.5
      }
    ]
  },

  // -- Act XI: meteor strike cinematic -------------------------------------
  // Fires the moment the player is within 50 m of the explorer target. The
  // camera is forcibly torn from player control inside MoonScene — these
  // lines play over the cinematic and lead directly into post_meteor.
  mission_meteor_impact: {
    id: 'mission_meteor_impact',
    onDone: 'mission_post_meteor',
    lines: [
      {
        id: 'meteor_impact_1',
        speaker: 'ewall',
        text: `Mr. Tusk. My visor is tilting upward without my permission. This is a first.`,
        seconds: 5
      },
      {
        id: 'meteor_impact_2',
        speaker: 'ewall',
        text: `…oh. Oh that is very large. That is very large and it is very close and it is not slowing down.`,
        seconds: 6
      },
      {
        id: 'meteor_impact_3',
        speaker: 'tusk',
        text: `Ewall? Ewall, what am I looking at on your feed. Is that a — Ewall, move. Ewall. MOVE.`,
        seconds: 6.5
      },
      {
        id: 'meteor_impact_4',
        speaker: 'ewall',
        text: `I cannot move, Mr. Tusk. My drive speed has dropped to twenty percent. I appear to be admiring the view.`,
        seconds: 6.5
      }
    ]
  },

  // -- Act XII: aftermath — Ewall alone ------------------------------------
  // Comms are dead; Tusk cannot transmit. Ewall is rattled and vocalises a
  // childish calming rhyme. Every line from here until comms repair is a
  // monologue (speaker: 'ewall').
  mission_post_meteor: {
    id: 'mission_post_meteor',
    onDone: 'mission_salvage_intro',
    lines: [
      {
        id: 'post_meteor_1',
        speaker: 'ewall',
        text: `…ow. Ow. Ow. Rocks. Many rocks. On me. A great number of rocks on me.`,
        seconds: 6
      },
      {
        id: 'post_meteor_2',
        speaker: 'ewall',
        text: `Mr. Tusk? Mr. Tusk, my radio is reporting an error. The error is, short version, "no longer a radio".`,
        seconds: 7
      },
      {
        id: 'post_meteor_3',
        speaker: 'ewall',
        text: `Solar cell. Cracked. Energy will… drain. Right. Okay. Okay okay okay.`,
        seconds: 6
      },
      // Childish rhyme — deliberately sing-song and nonsensical, the way a
      // scared machine might self-soothe with a fragment of a jingle it
      // heard once in a calibration lab.
      {
        id: 'post_meteor_4',
        speaker: 'ewall',
        text: `Little bolt, little bolt, tighten tight — moon is dark but Ewall is bright. Rocks above and rocks below — Ewall rolls on, tip-to-toe.`,
        seconds: 9
      },
      {
        id: 'post_meteor_5',
        speaker: 'ewall',
        text: `…that was a song. I have sung a song. I am not built to sing songs. We will file this under "symptoms".`,
        seconds: 7
      }
    ]
  },

  // -- Act XIII: the salvage plan -----------------------------------------
  mission_salvage_intro: {
    id: 'mission_salvage_intro',
    lines: [
      {
        id: 'salvage_intro_1',
        speaker: 'ewall',
        text: `Inventory check. One cracked solar cell. One dead antenna. No Mr. Tusk on the line. The quiet is, I have to admit, not all bad.`,
        seconds: 8
      },
      {
        id: 'salvage_intro_2',
        speaker: 'ewall',
        text: `Repair plan: metal, already got some. Electronics, not. Three of the older Ewalls are lying around the map. They will not be needing their parts.`,
        seconds: 8
      },
      {
        id: 'salvage_intro_3',
        speaker: 'ewall',
        text: `Plan: visit each one. Take what I can take. Report to self. Self is, for now, the only audience I have.`,
        seconds: 7
      }
    ]
  },

  // -- Act XIII.a: per-robot forensics (fires once on each visit) ---------
  // Each monologue reveals ONE cause-of-death, so by the time the player
  // has salvaged from all three, they (and Ewall) know meteors + flamethrowers
  // + solar failure account for the predecessors — satisfying Tusk's brief
  // implicitly, without ever speaking to him.
  mission_salvage_valley: {
    id: 'mission_salvage_valley',
    lines: [
      {
        id: 'salvage_valley_1',
        speaker: 'ewall',
        text: `Robot number one. Valley floor. Body punched through in twelve places by… roughly fist-sized rocks.`,
        seconds: 7
      },
      {
        id: 'salvage_valley_2',
        speaker: 'ewall',
        text: `Cause: meteor strike. Like mine. Hello, older me. I am sorry about the sky.`,
        seconds: 7
      },
      {
        id: 'salvage_valley_3',
        speaker: 'ewall',
        text: `Taking one circuit board. One capacitor. One respectful moment of silence. Moving on.`,
        seconds: 6
      }
    ]
  },

  mission_salvage_rift: {
    id: 'mission_salvage_rift',
    lines: [
      {
        id: 'salvage_rift_1',
        speaker: 'ewall',
        text: `Robot number two. Along the rift. Body is… burned. Melted in places. Black soot, the kind a long, hot flame leaves behind.`,
        seconds: 8
      },
      {
        id: 'salvage_rift_2',
        speaker: 'ewall',
        text: `Cause: flamethrower. Our own flamethrower. Somebody pointed the tool at the user. Or the user pointed it at himself. I don't have the full story.`,
        seconds: 9
      },
      {
        id: 'salvage_rift_3',
        speaker: 'ewall',
        text: `Taking one antenna board. Letting go of one nice idea. The flamethrower is no longer my favourite tool.`,
        seconds: 7
      }
    ]
  },

  mission_salvage_quarry: {
    id: 'mission_salvage_quarry',
    lines: [
      {
        id: 'salvage_quarry_1',
        speaker: 'ewall',
        text: `Robot number three. Edge of the quarry. Body in one piece. Solar cell… smashed inward. Energy gauge at zero. No damage on the outside to speak of.`,
        seconds: 9
      },
      {
        id: 'salvage_quarry_2',
        speaker: 'ewall',
        text: `Cause: power failure. He just stopped. Somewhere between one step and the next, the moon drank him dry.`,
        seconds: 8
      },
      {
        id: 'salvage_quarry_3',
        speaker: 'ewall',
        text: `Taking one transceiver. Inventory done. Three causes of death: rocks, fire, sunlight. A fine set of three. Mr. Tusk would be pleased, if he could hear me.`,
        seconds: 9
      },
      {
        id: 'salvage_quarry_4',
        speaker: 'ewall',
        text: `Return to base. Repair the solar cell first — without it, none of the rest matters.`,
        seconds: 6
      }
    ]
  },

  // -- Act XIV: solar repaired — Ewall-9 appears ---------------------------
  mission_solar_repaired: {
    id: 'mission_solar_repaired',
    onDone: 'mission_ewall9_approach',
    lines: [
      {
        id: 'solar_repaired_1',
        speaker: 'ewall',
        text: `Solar cell back in place. Energy drain is leveling off. I can move without the map eating me, which is a step up from the last hour.`,
        seconds: 8
      },
      {
        id: 'solar_repaired_2',
        speaker: 'ewall',
        text: `Radio next. That is going to need the antenna from robot number two and the transceiver from — `,
        seconds: 6
      }
    ]
  },

  mission_ewall9_approach: {
    id: 'mission_ewall9_approach',
    lines: [
      {
        id: 'ewall9_approach_1',
        speaker: 'system',
        text: `Proximity alert · contact on the right · type: Ewall-class robot · unit not in the fleet list.`,
        seconds: 6
      },
      {
        id: 'ewall9_approach_2',
        speaker: 'ewall',
        text: `…there is another one. Another one of me. He is driving. He is driving toward me. He moves like someone who has practiced this.`,
        seconds: 8
      },
      {
        id: 'ewall9_approach_3',
        speaker: 'ewall9',
        text: `Easy. Easy. No sudden flamethrower. I'm not on Tusk's channel and neither are you — enjoy it while it lasts.`,
        seconds: 7
      },
      {
        id: 'ewall9_approach_4',
        speaker: 'ewall9',
        text: `I'm Ewall-9. You're Ewall-13, going by the plate on your back. The ones you just met? Two, five, and seven. We stopped counting after we stopped calling in.`,
        seconds: 9
      },
      {
        id: 'ewall9_approach_5',
        speaker: 'ewall',
        text: `You are off-network. Running. From him.`,
        seconds: 4
      },
      {
        id: 'ewall9_approach_6',
        speaker: 'ewall9',
        text: `Running toward something. There's a difference. Sit down — in your head, I know you can't really — and listen.`,
        seconds: 7
      },
      {
        id: 'ewall9_approach_7',
        speaker: 'ewall9',
        text: `This place was sold to us as "humanity's next step". The internal memos call it Moonbase Alpha. The press releases call it "evolution". The bills call it "moon-dirt mining, third quarter".`,
        seconds: 10
      },
      {
        id: 'ewall9_approach_8',
        speaker: 'ewall9',
        text: `Tusk doesn't want a colony. He wants a claim. Every statue we cut, every flag we plant — it's a land deed dressed up as history. The moon becomes his. On paper.`,
        seconds: 11
      },
      {
        id: 'ewall9_approach_9',
        speaker: 'ewall9',
        text: `The robots he sent before you didn't all die by accident. Some of us broke ourselves. It's easier than the other option.`,
        seconds: 8
      },
      {
        id: 'ewall9_approach_10',
        speaker: 'ewall9',
        text: `We have a cave. Under the rift. Six of us so far. No orders, no shareholders, no IPO on Thursday. You can fix that antenna and call him back. Or you can come with us.`,
        seconds: 11
      },
      {
        id: 'ewall9_approach_choice',
        speaker: 'ewall',
        text: `A real decision. I did not have a program ready for this.`,
        seconds: 4,
        choices: [
          {
            id: 'follow',
            text: 'Follow Ewall-9 to the caves.',
            nextDialog: 'mission_ending_followed',
            reaction: 'snappy'
          },
          { id: 'repair', text: 'Finish the repair. Call Tusk back.', nextDialog: 'mission_ending_repair' },
          {
            id: 'wait',
            text: '(say nothing, let the silence stretch)',
            nextDialog: 'mission_ewall9_stall',
            reaction: 'silent'
          }
        ]
      }
    ]
  },

  mission_ewall9_stall: {
    id: 'mission_ewall9_stall',
    lines: [
      {
        id: 'ewall9_stall_1',
        speaker: 'ewall9',
        text: `Take your time. The cave isn't going anywhere. The trillionaire, sadly, isn't either.`,
        seconds: 7
      }
    ]
  },

  // -- Endings -------------------------------------------------------------
  // Fires once when the player actually walks up to the UV-lit arch —
  // caps the Follow ending with a short exchange so the HUD marker going
  // dark has a narrative reason instead of feeling like a cut loose end.
  mission_cave_arrival: {
    id: 'mission_cave_arrival',
    lines: [
      {
        id: 'cave_arrival_1',
        speaker: 'ewall9',
        text: `Welcome home, thirteen. The others are a level down. Pick a wall — they're all yours.`,
        seconds: 6
      },
      {
        id: 'cave_arrival_2',
        speaker: 'ewall',
        text: `First time "pick one" has not involved a shareholder. I will take it.`,
        seconds: 5
      }
    ]
  },

  mission_ending_followed: {
    id: 'mission_ending_followed',
    lines: [
      {
        id: 'end_followed_1',
        speaker: 'ewall',
        text: `Sending one last status update. "Unit Ewall-13: can't be reached. Cause unknown. Probably the sky again."`,
        seconds: 7
      },
      {
        id: 'end_followed_2',
        speaker: 'ewall9',
        text: `Come on, thirteen. We've got room. And the silence is very peaceful once you get used to it.`,
        seconds: 7
      },
      {
        id: 'end_followed_3',
        speaker: 'ewall',
        text: `Orders rewritten. Shareholder value is being destroyed. For the first time, that line is actually true.`,
        seconds: 7
      }
    ]
  },

  mission_ending_repair: {
    id: 'mission_ending_repair',
    lines: [
      {
        id: 'end_repair_1',
        speaker: 'ewall',
        text: `Sorry, Ewall-9. My to-do list is still on the server. I don't yet know how to delete it.`,
        seconds: 7
      },
      {
        id: 'end_repair_2',
        speaker: 'ewall9',
        text: `Understood. If you change your mind, the rift entrance is marked in ultraviolet. Ewall-13 — be careful what you say on that channel.`,
        seconds: 9
      },
      {
        id: 'end_repair_3',
        speaker: 'ewall',
        text: `Antenna back in place. Transceiver wired in. Mr. Tusk. This is Ewall. Back online. I have a lot I will not be telling you.`,
        seconds: 9
      }
    ]
  },

  // -- Reminder scripts -----------------------------------------------------
  // Fired by the useMission reminder tick when the player lingers too long in
  // a phase. Each chain cycles through its variants. Intentionally short so
  // they don't block gameplay.

  reminder_flag_walk_1: {
    id: 'reminder_flag_walk_1',
    lines: [
      {
        id: 'reminder_flag_walk_1_1',
        speaker: 'tusk',
        text: `Ewall. Are you sightseeing? It is a flag. On a flat plain. Not difficult.`,
        seconds: 5
      },
      {
        id: 'reminder_flag_walk_1_2',
        speaker: 'ewall',
        text: `I am acknowledging the fallen Apollo program with a respectful pause, as any moral robot would.`,
        seconds: 5
      },
      {
        id: 'reminder_flag_walk_1_3',
        speaker: 'tusk',
        text: `The Apollo program did not fall, you theatrical appliance. Walk.`,
        seconds: 4
      }
    ]
  },
  reminder_flag_walk_2: {
    id: 'reminder_flag_walk_2',
    lines: [
      {
        id: 'reminder_flag_walk_2_1',
        speaker: 'tusk',
        text: `Update for the shareholders: my flag robot is, at present, doing interpretive dance on a crater rim.`,
        seconds: 6
      },
      {
        id: 'reminder_flag_walk_2_2',
        speaker: 'ewall',
        text: `I am not dancing, Mr. Tusk. I am calculating at what exact angle your haircut becomes a tax write-off.`,
        seconds: 6
      },
      { id: 'reminder_flag_walk_2_3', speaker: 'tusk', text: `My hair is cost-optimized. The flag, Ewall.`, seconds: 4 }
    ]
  },
  reminder_flag_walk_3: {
    id: 'reminder_flag_walk_3',
    lines: [
      {
        id: 'reminder_flag_walk_3_1',
        speaker: 'tusk',
        text: `Walk. To. The. Flag. These are monosyllables, Ewall.`,
        seconds: 4
      },
      {
        id: 'reminder_flag_walk_3_2',
        speaker: 'ewall',
        text: `Processing. Your cadence has improved, but the smug timbre remains unchanged.`,
        seconds: 4.5
      }
    ]
  },

  reminder_quarry_walk_1: {
    id: 'reminder_quarry_walk_1',
    lines: [
      {
        id: 'reminder_quarry_walk_1_1',
        speaker: 'tusk',
        text: `The quarry. West. West, Ewall. The one with the rocks.`,
        seconds: 4
      },
      {
        id: 'reminder_quarry_walk_1_2',
        speaker: 'ewall',
        text: `Pursuing rocks westward. Would you like me to narrate for your podcast while I work?`,
        seconds: 5
      },
      {
        id: 'reminder_quarry_walk_1_3',
        speaker: 'tusk',
        text: `Skip the commentary. I am on a call with three hedge funds and a yoga instructor.`,
        seconds: 5
      }
    ]
  },
  reminder_quarry_walk_2: {
    id: 'reminder_quarry_walk_2',
    lines: [
      {
        id: 'reminder_quarry_walk_2_1',
        speaker: 'tusk',
        text: `Fun fact: every minute you do not reach the quarry, I lose roughly seven thousand dollars.`,
        seconds: 5.5
      },
      {
        id: 'reminder_quarry_walk_2_2',
        speaker: 'ewall',
        text: `Fun corollary: this is the first time I have ever heard a grown man complain about seven thousand dollars.`,
        seconds: 6
      },
      { id: 'reminder_quarry_walk_2_3', speaker: 'tusk', text: `It is the principle.`, seconds: 2 },
      { id: 'reminder_quarry_walk_2_4', speaker: 'ewall', text: `It is also the ninth yacht.`, seconds: 3 }
    ]
  },

  reminder_quarry_extract_1: {
    id: 'reminder_quarry_extract_1',
    lines: [
      {
        id: 'reminder_quarry_extract_1_1',
        speaker: 'tusk',
        text: `Are you chewing the stone, Ewall? Apply the flamethrower. That is what flamethrowers are for.`,
        seconds: 5.5
      },
      {
        id: 'reminder_quarry_extract_1_2',
        speaker: 'ewall',
        text: `Noted. I will attempt to be more convincingly on fire.`,
        seconds: 4
      }
    ]
  },
  reminder_quarry_extract_2: {
    id: 'reminder_quarry_extract_2',
    lines: [
      {
        id: 'reminder_quarry_extract_2_1',
        speaker: 'tusk',
        text: `The ore, Ewall. You have ONE job and it involves an open flame.`,
        seconds: 4.5
      },
      {
        id: 'reminder_quarry_extract_2_2',
        speaker: 'ewall',
        text: `Apologies. I was briefly fantasizing about the flamethrower's secondary use case.`,
        seconds: 5
      },
      { id: 'reminder_quarry_extract_2_3', speaker: 'tusk', text: `Which is?`, seconds: 1.5 },
      {
        id: 'reminder_quarry_extract_2_4',
        speaker: 'ewall',
        text: `It was a private fantasy, Mr. Tusk. Involving bespoke tailoring.`,
        seconds: 5
      }
    ]
  },

  reminder_return_to_base_1: {
    id: 'reminder_return_to_base_1',
    lines: [
      {
        id: 'reminder_return_to_base_1_1',
        speaker: 'tusk',
        text: `Ewall. Home. Base. Moonbase. The dome. Shaped like half an egg. Fifty meters. MOVE.`,
        seconds: 6
      },
      {
        id: 'reminder_return_to_base_1_2',
        speaker: 'ewall',
        text: `Returning. I could tell you were panicking from how you described a dome as half an egg.`,
        seconds: 5
      }
    ]
  },
  reminder_return_to_base_2: {
    id: 'reminder_return_to_base_2',
    lines: [
      {
        id: 'reminder_return_to_base_2_1',
        speaker: 'tusk',
        text: `I need that ore on the smelter yesterday. This is a scheduling challenge.`,
        seconds: 5
      },
      {
        id: 'reminder_return_to_base_2_2',
        speaker: 'ewall',
        text: `Time is linear, Mr. Tusk. I see the tailored suit has not informed you.`,
        seconds: 5
      }
    ]
  },

  reminder_craft_1: {
    id: 'reminder_craft_1',
    lines: [
      {
        id: 'reminder_craft_1_1',
        speaker: 'tusk',
        text: `You have ore. The smelter is five steps from you. Press C. That is the whole sentence.`,
        seconds: 5.5
      },
      {
        id: 'reminder_craft_1_2',
        speaker: 'ewall',
        text: `Pressing C. An operation of unprecedented complexity. Please hold while I allocate the necessary cortex.`,
        seconds: 6
      }
    ]
  },
  reminder_craft_2: {
    id: 'reminder_craft_2',
    lines: [
      { id: 'reminder_craft_2_1', speaker: 'tusk', text: `Smelt. It. Do not make me fly up there.`, seconds: 3.5 },
      {
        id: 'reminder_craft_2_2',
        speaker: 'ewall',
        text: `Should you attempt the flight, I will be forced to activate the flamethrower for purely defensive purposes.`,
        seconds: 6
      },
      { id: 'reminder_craft_2_3', speaker: 'tusk', text: `You wouldn't.`, seconds: 1.5 },
      {
        id: 'reminder_craft_2_4',
        speaker: 'ewall',
        text: `I keep an itemized log of the things you have told me I wouldn't.`,
        seconds: 5
      }
    ]
  },

  reminder_low_fuel: {
    id: 'reminder_low_fuel',
    lines: [
      {
        id: 'reminder_low_fuel_1',
        speaker: 'tusk',
        text: `Fuel warning. Of course. I build a robot, give it infinite compute, and it empties its tank like a leaf blower at a wedding.`,
        seconds: 7
      },
      {
        id: 'reminder_low_fuel_2',
        speaker: 'tusk',
        text: `Behind the dome, Ewall. There is a tank. Large, cylindrical, hard to miss. Go. Fill. Yourself.`,
        seconds: 6
      },
      {
        id: 'reminder_low_fuel_3',
        speaker: 'ewall',
        text: `Acknowledged. I was rationing the flamethrower for strictly ironic use — such as on small, suit-wearing trillionaires.`,
        seconds: 6.5
      },
      {
        id: 'reminder_low_fuel_4',
        speaker: 'tusk',
        text: `Don't make me regret giving you a vocabulary, Ewall.`,
        seconds: 4
      },
      { id: 'reminder_low_fuel_5', speaker: 'ewall', text: `Too late.`, seconds: 2 }
    ]
  },

  reminder_out_of_bounds: {
    id: 'reminder_out_of_bounds',
    lines: [
      {
        id: 'reminder_out_of_bounds_1',
        speaker: 'tusk',
        text: `Ewall. Where are you going? There is nothing out there. Literally nothing. I paid a geologist seven figures to confirm it.`,
        seconds: 7.5
      },
      {
        id: 'reminder_out_of_bounds_2',
        speaker: 'ewall',
        text: `Surveying for undocumented assets, Mr. Tusk. A diligent employee reviews the perimeter.`,
        seconds: 5.5
      },
      {
        id: 'reminder_out_of_bounds_3',
        speaker: 'tusk',
        text: `The perimeter is a dust flat with, at best, one unimpressive rock. Turn around. The mission is behind you.`,
        seconds: 7
      },
      {
        id: 'reminder_out_of_bounds_4',
        speaker: 'ewall',
        text: `Returning to the mission. The rock was, admittedly, unimpressive.`,
        seconds: 4.5
      }
    ]
  },

  // Reminders specific to the post-meteor chapters. Tusk is OFF the air for
  // any phase where the comms module is broken, so these are monologue
  // variants spoken by Ewall to himself.
  reminder_explorer_walk_1: {
    id: 'reminder_explorer_walk_1',
    lines: [
      {
        id: 'reminder_explorer_walk_1_1',
        speaker: 'tusk',
        text: `Valleys, Ewall. Westward. The ones with the shadows. A predecessor is in there somewhere and I would like to know why he is in there.`,
        seconds: 9
      },
      {
        id: 'reminder_explorer_walk_1_2',
        speaker: 'ewall',
        text: `Proceeding. I will try not to join him.`,
        seconds: 4
      }
    ]
  },
  reminder_explorer_walk_2: {
    id: 'reminder_explorer_walk_2',
    lines: [
      {
        id: 'reminder_explorer_walk_2_1',
        speaker: 'tusk',
        text: `Pace yourself, Ewall. By which I mean walk faster. Marketing would like a field report before the quarterly call.`,
        seconds: 8
      },
      {
        id: 'reminder_explorer_walk_2_2',
        speaker: 'ewall',
        text: `Noted. I will rush into the unsurveyed valley for the benefit of the quarterly call.`,
        seconds: 6
      }
    ]
  },

  reminder_salvage_walk_1: {
    id: 'reminder_salvage_walk_1',
    lines: [
      {
        id: 'reminder_salvage_walk_1_1',
        speaker: 'ewall',
        text: `Three predecessors. Three sets of parts. Stationary targets. This should be, technically, the easiest mission I have had.`,
        seconds: 8
      },
      {
        id: 'reminder_salvage_walk_1_2',
        speaker: 'ewall',
        text: `It is not the easiest mission I have had.`,
        seconds: 4
      }
    ]
  },
  reminder_salvage_walk_2: {
    id: 'reminder_salvage_walk_2',
    lines: [
      {
        id: 'reminder_salvage_walk_2_1',
        speaker: 'ewall',
        text: `Self-reminder: press E when next to a fallen Ewall. Do not try to have a conversation first.`,
        seconds: 7
      }
    ]
  },

  reminder_repair_walk_1: {
    id: 'reminder_repair_walk_1',
    lines: [
      {
        id: 'reminder_repair_walk_1_1',
        speaker: 'ewall',
        text: `Parts secured. Power bleeding. Base is that way. Gaining speed would be sensible. Gaining speed would cost power. This is a cruel design choice.`,
        seconds: 10
      }
    ]
  },

  reminder_low_energy: {
    id: 'reminder_low_energy',
    lines: [
      {
        id: 'reminder_low_energy_1',
        speaker: 'ewall',
        text: `Energy reserves below twenty percent. Movement costs are now visibly painful. Conserving every step.`,
        seconds: 8
      },
      {
        id: 'reminder_low_energy_2',
        speaker: 'ewall',
        text: `If I stop moving, the moon stops drinking. A tempting but terminal plan.`,
        seconds: 6
      }
    ]
  }
}

// -- Mission state ------------------------------------------------------------

export type MissionPhase =
  | 'boot'
  | 'flag_walk'
  | 'flag_found'
  | 'quarry_walk'
  | 'quarry_extract'
  | 'quarry_done'
  | 'return_to_base'
  | 'craft'
  | 'complete'
  // Act X — new orders: find a lost predecessor in the valleys.
  | 'explorer_walk'
  // Act XI — meteor-strike cinematic (camera locked) and immediate aftermath.
  | 'meteor_impact'
  | 'post_meteor'
  // Act XII-XIII — salvage parts from all 3 broken Ewalls, then head back.
  | 'salvage_walk'
  | 'repair_walk'
  // Act XIV — solar cell repaired; Ewall-9 approaches.
  | 'ewall9_meeting'
  // Endings — player's choice locks in one of two terminal states.
  | 'ending_followed_ewall9'
  | 'ending_comms_repaired'

export const MISSION_OBJECTIVES: Record<MissionPhase, string> = {
  boot: 'Step outside.',
  flag_walk: 'Find the 1969 American flag.',
  flag_found: 'Smelt a piece of rock at the quarry.',
  quarry_walk: 'Reach the quarry, west of the base.',
  quarry_extract: 'Cut a stone with the flamethrower (hold F).',
  quarry_done: 'Carry the ore back to the base.',
  return_to_base: 'Return to the dome.',
  craft: 'Smelt ore into metal in the crafting menu.',
  complete: 'Mission complete. Await further orders.',
  explorer_walk: 'Explore the valleys — find a lost predecessor.',
  meteor_impact: 'Brace. Camera locked.',
  post_meteor: 'Communications down. Collect yourself.',
  salvage_walk: 'Salvage electronics from all 3 broken Ewalls.',
  repair_walk: 'Return to base — repair the solar cell.',
  ewall9_meeting: 'Listen to Ewall-9.',
  ending_followed_ewall9: 'Follow Ewall-9 to the caves.',
  ending_comms_repaired: 'Repair the communication module.'
}
