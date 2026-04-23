import { ref, computed, type ComputedRef, watch } from 'vue'
import useUser, { isDemo } from '@/use/useUser'
import { useI18n } from 'vue-i18n'
import { isCampaignTest, isDebug } from '@/use/useMatch'

export interface CampaignNode {
  id: string
  name: string
  description: string
  npcTeam: string[]
  position: { x: number; y: number }
  unlocked: boolean
  completed: boolean
  unlocks: string[]
  knownCards?: string[]
}

export interface MobileNode {
  id: string
  positionPortrait: { x: number; y: number }
  positionLandscape: { x: number; y: number }
}


export const demoCampaignNodes: Array<{ id: string }> = [
  // --- TRACK 1: WESTERN COAST ---
  { id: 'node-w1' },
  { id: 'node-w1-b' }
]

export const selectedNodeId = ref<string | null>(null)
export const campaignNodes = ref<CampaignNode[]>([])

// Dynamic active node based on selection
export const activeNode: ComputedRef<CampaignNode | null> = computed((): CampaignNode | null =>
  campaignNodes.value.find(n => n.id === selectedNodeId.value) || null
)

export const useCampaign = () => {
  const { setSettingValue, userCampaign } = useUser()
  const { t } = useI18n()
  isCampaignTest.value ? true : false

  campaignNodes.value = [
    // --- TRACK 1: WESTERN COAST (Nature & Water) ---
    {
      id: 'node-w1',
      name: t('node-w1.name'),
      description: t('node-w1.desc'),
      // Node 1: 100% Young Nature/Water/Neutral
      npcTeam: ['mermaid-young', 'moss-young', 'mushroom-young', 'piranha-young', 'sirene-young', 'turtoise-young', 'cosmica-young', 'butterfly-young', 'dragon-young', 'snowman-young'],
      position: { x: 16, y: 81 },
      unlocked: true,
      completed: false,
      unlocks: ['node-w1-b', 'node-w-chal']
    },
    {
      id: 'node-w1-b',
      name: t('node-w1-b.name'),
      description: t('node-w1-b.desc'),
      // Node 2: 100% Young Metal/Earth/Neutral
      npcTeam: ['scorpion-young', 'piranha-young', 'warrior-young', 'dragon-young', 'gruffalo-young', 'gargoyle-young', 'cosmic-young', 'tardigrade-young', 'eel-young'],
      position: { x: 38, y: 68 },
      unlocked: isCampaignTest.value ? true : false,
      completed: false,
      unlocks: ['node-w2', 'node-w-all']
    },
  ]

  const mobileNodes: MobileNode[] = [
    // --- TRACK 1: WESTERN COAST ---
    {
      id: 'node-w1',
      positionPortrait: { x: 23, y: 88 },
      positionLandscape: { x: 44, y: 93 }
    },
    {
      id: 'node-w1-b',
      positionPortrait: { x: 48, y: 75 },
      positionLandscape: { x: 53, y: 85 }
    },
    {
      id: 'node-w-chal',
      positionPortrait: { x: 55, y: 86 },
      positionLandscape: { x: 68, y: 92 }
    },
    {
      id: 'node-w-all',
      positionPortrait: { x: 33, y: 76 },
      positionLandscape: { x: 46, y: 78 }
    },
    {
      id: 'node-w2',
      positionPortrait: { x: 53, y: 60 },
      positionLandscape: { x: 54, y: 68 }
    },
    {
      id: 'node-w2-b',
      positionPortrait: { x: 26, y: 54 },
      positionLandscape: { x: 38, y: 60 }
    },
    {
      id: 'node-w3',
      positionPortrait: { x: 20, y: 32 }, // Pineguard
      positionLandscape: { x: 18, y: 48 }
    },

    // --- TRACK 2: EASTERN DESERT ---
    {
      id: 'node-e1',
      positionPortrait: { x: 68, y: 88 }, // Red Sands
      positionLandscape: { x: 78, y: 92 }
    },
    {
      id: 'node-e1-b',
      positionPortrait: { x: 88, y: 82 },
      positionLandscape: { x: 91, y: 92 }
    },
    {
      id: 'node-e-chal',
      positionPortrait: { x: 92, y: 76 }, // Sunshade
      positionLandscape: { x: 95, y: 78 }
    },
    {
      id: 'node-e2',
      positionPortrait: { x: 77, y: 78 },
      positionLandscape: { x: 83, y: 83 }
    },
    {
      id: 'node-e2-b',
      positionPortrait: { x: 74, y: 70 }, // River delta
      positionLandscape: { x: 78, y: 72 }
    },
    {
      id: 'node-e3',
      positionPortrait: { x: 72, y: 46 },  // Ashhold
      positionLandscape: { x: 61, y: 45 }
    },

    // --- TRACK 3: CENTRAL CONVERGENCE ---
    {
      id: 'node-c0',
      positionPortrait: { x: 51, y: 50 },
      positionLandscape: { x: 51, y: 50 }
    },
    {
      id: 'node-c1',
      positionPortrait: { x: 35, y: 45 }, // Highrock
      positionLandscape: { x: 44, y: 37 }
    },
    {
      id: 'node-c1-b',
      positionPortrait: { x: 43, y: 28 }, // Twin Peaks
      positionLandscape: { x: 48, y: 22 }
    },
    {
      id: 'node-c2',
      positionPortrait: { x: 56, y: 20 },
      positionLandscape: { x: 55, y: 10 }
    },

    // --- TRACK 4: FINAL SUMMIT ---
    {
      id: 'node-f1',
      positionPortrait: { x: 48, y: 14 },
      positionLandscape: { x: 37, y: 20 }
    },
    {
      id: 'node-final',
      positionPortrait: { x: 50, y: 9 }, // Mount Cinder Peak
      positionLandscape: { x: 31, y: 14 }
    },

    // --- TRACK 5: ABYSSAL SIDE-TRACK ---
    {
      id: 'node-s1',
      positionPortrait: { x: 12, y: 21 },
      positionLandscape: { x: 6, y: 40 }
    },
    {
      id: 'node-s1-b',
      positionPortrait: { x: 6, y: 15 },
      positionLandscape: { x: 3, y: 28 }
    },
    {
      id: 'node-s1-c',
      positionPortrait: { x: 21, y: 14 },
      positionLandscape: { x: 12, y: 26 }
    },
    {
      id: 'node-s2',
      positionPortrait: { x: 6, y: 4 },
      positionLandscape: { x: 6, y: 9 }
    },

    // --- TRACK 6: EASTERN ARCHIPELAGO & REEF ---
    {
      id: 'node-a1',
      positionPortrait: { x: 82, y: 31 },
      positionLandscape: { x: 73, y: 24 }
    },
    {
      id: 'node-a2',
      positionPortrait: { x: 72, y: 27 },
      positionLandscape: { x: 70, y: 11 }
    },
    {
      id: 'node-a3',
      positionPortrait: { x: 78, y: 15 },
      positionLandscape: { x: 87, y: 25 }
    },

    // --- TRACK 7: NORTH EASTERN ISLAND ---
    {
      id: 'node-ne1',
      positionPortrait: { x: 92, y: 23 },
      positionLandscape: { x: 96, y: 44 }
    },
    {
      id: 'node-ne2',
      positionPortrait: { x: 95, y: 8 },
      positionLandscape: { x: 96, y: 19 }
    },
    {
      id: 'node-ne3',
      positionPortrait: { x: 91, y: 3 },
      positionLandscape: { x: 92, y: 8 }
    }
  ]

  watch(userCampaign, () => {
    if (typeof userCampaign.value === 'string') {
      const campaignList = JSON.parse(userCampaign.value)
      if (campaignList?.[0]) {
        campaignList[0].unlocked = true
      }

      const demoRelevantNodes = JSON.parse(JSON.stringify(demoCampaignNodes))
      demoRelevantNodes.pop()
      demoRelevantNodes.pop()
      campaignList?.forEach((saved: any) => {
        const node = campaignNodes.value.find(n => n.id === saved.id)
        if (node) {
          node.completed = saved.completed
          node.knownCards = saved.knownCards || []
          // If a node is completed, unlock its children
          if (node.completed) {
            if (isDemo && !demoRelevantNodes.some((demo: any) => demo.id === node.id)) return

            node.unlocks.forEach(childId => {
              const child = campaignNodes.value.find(c => c.id === childId)
              if (child) child.unlocked = true
            })
          }
        }
      })
    }
  }, { immediate: true })

  const hasWonAnyGame = computed(() => campaignNodes.value.some(n => n.completed))

  const completeNode = (currentNode: CampaignNode) => {
    if (!currentNode) return

    const oldNode = campaignNodes.value.find(n => n.id === currentNode.id)
    if (!oldNode) return

    const demoRelevantNodes = JSON.parse(JSON.stringify(demoCampaignNodes))
    demoRelevantNodes.pop()
    demoRelevantNodes.pop()

    oldNode.completed = true
    oldNode.knownCards = currentNode.knownCards
    oldNode.unlocks.forEach(nextId => {
      if (isDemo && !demoRelevantNodes.some((demo: any) => demo.id === nextId)) return

      const nextNode = campaignNodes.value.find(n => n.id === nextId)
      if (nextNode) nextNode.unlocked = true
    })

    const storedNodes = campaignNodes.value.map(n => ({
      id: n.id,
      completed: n.completed,
      knownCards: n.id === currentNode.id ? currentNode?.knownCards : n.knownCards
    }))
    setSettingValue('campaign', storedNodes)
  }

  const saveCampaign = (currentNode: CampaignNode) => {
    if (!currentNode) return

    const oldNode = campaignNodes.value.find(n => n.id === currentNode.id)
    if (!oldNode) return

    const storedNodes = campaignNodes.value.map(n => ({
      id: n.id,
      completed: n.completed,
      knownCards: n.id === oldNode.id ? currentNode?.knownCards : n.knownCards
    }))
    setSettingValue('campaign', storedNodes)
  }

  return {
    campaignNodes,
    mobileNodes,
    selectedNodeId,
    saveCampaign,
    activeNode,
    completeNode,
    hasWonAnyGame
  }
}

export default useCampaign