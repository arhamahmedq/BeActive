import { StoryCardLive } from '@/lib/story-card/StoryCardLive'
import { getPlant, WORKOUT_LABELS, WORKOUT_ICONS } from '@/lib/story-card/constants'

// ---------------------------------------------------------------------------
// DEV-ONLY — live, animated preview of the V2 story card "liquid glass"
// atmosphere (Framer Motion). The PNG actually shared to Instagram
// (/api/stories/generate, /api/stories/preview) is a single frozen frame
// rendered by Satori, which has no JS runtime and cannot animate. This page
// renders the same composition via <StoryCardLive> — real DOM/CSS — so the
// ambient blob drift, refraction shimmer, and floating particles can be
// evaluated live, at 60fps, with `prefers-reduced-motion` respected.
// ---------------------------------------------------------------------------

const STREAK = 12
const BEST = 14

export default function StoryPreviewLivePage() {
  const plant = getPlant(STREAK)

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        background: 'linear-gradient(180deg, #0B0F0C 0%, #111815 100%)',
      }}
    >
      <StoryCardLive
        imageUrl="/sample-workout.jpg"
        avatarUrl="/sample-workout.jpg"
        username="arhamfit"
        workoutLabel={WORKOUT_LABELS.GYM}
        workoutIcon={WORKOUT_ICONS.GYM}
        streakCount={STREAK}
        bestStreak={BEST}
        isPersonalBest={false}
        plantEmoji={plant.emoji}
        plantName={plant.name}
      />
    </main>
  )
}
