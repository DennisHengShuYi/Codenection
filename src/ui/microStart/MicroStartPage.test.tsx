import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Ladder } from '../../domain/ladder'
import type { ScheduledItem } from '../../optimizer'
import { MicroStartPage } from './MicroStartPage'

const item: ScheduledItem = {
  id: 'b1',
  title: 'Ethics essay',
  type: 'mental',
  kind: 'studyBlock',
  hours: 3,
  intensity: 1,
  dayIndex: 0,
  startHour: 9,
  fixed: false,
  deadlineDay: null,
  protectedRest: false,
}

const ladder: Ladder = {
  blockId: 'b1',
  rungs: [
    { action: 'Open the document.', minutes: 2 },
    { action: 'Write the title.', minutes: 3 },
    { action: 'Write one bad sentence.', minutes: 5 },
  ],
  done: 1,
}

type PageProps = Parameters<typeof MicroStartPage>[0]

const renderPage = (over: Partial<PageProps> = {}) => {
  const onLadder = vi.fn<(next: Ladder) => void>()
  const onDone = vi.fn<(itemId: string) => void>()
  const onBack = vi.fn()
  const onClose = vi.fn()

  render(
    <MicroStartPage item={item} ladder={ladder} {...{ onLadder, onDone, onBack, onClose }} {...over} />,
  )

  return { onLadder, onDone, onBack, onClose }
}

const modelReply = {
  ok: true,
  json: async () => ({
    steps: [
      { action: 'Open the ethics essay.', minutes: 2 },
      { action: 'Write its title.', minutes: 3 },
      { action: 'Write one bad sentence.', minutes: 5 },
    ],
  }),
} as unknown as Response

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MicroStartPage', () => {
  // §4.1 as amended: the chain exists, exactly one rung is ever on screen. This is the
  // assertion the whole amendment rests on, so it asserts the absence of the others as well
  // as the presence of one -- a test that checked only what is shown would pass on a page
  // that also showed the rest.
  it('shows one rung and never the others', async () => {
    renderPage()

    expect(await screen.findByText('Write the title.')).toBeInTheDocument()
    expect(screen.queryByText('Open the document.')).not.toBeInTheDocument()
    expect(screen.queryByText('Write one bad sentence.')).not.toBeInTheDocument()
  })

  it('says where in the chain the student is', async () => {
    renderPage()

    expect(await screen.findByTestId('ladder-progress')).toHaveTextContent('Step 2 of 3')
  })

  it('prints the rung own time box', async () => {
    renderPage()

    expect(await screen.findByTestId('rung-minutes')).toHaveTextContent('3 minutes')
  })

  it('advances to the next rung and reports it up', async () => {
    const props = renderPage()
    await screen.findByText('Write the title.')

    await userEvent.click(screen.getByRole('button', { name: /next step/i }))

    expect(props.onLadder).toHaveBeenCalledWith(expect.objectContaining({ blockId: 'b1', done: 2 }))
    expect(await screen.findByText('Write one bad sentence.')).toBeInTheDocument()
  })

  it('generates a chain when the block has never been opened', async () => {
    const props = renderPage({ ladder: null })

    await waitFor(() => expect(props.onLadder).toHaveBeenCalled())
    // Offline, so this is the rule chain -- a real answer, not a degraded one.
    expect(props.onLadder.mock.calls[0]?.[0].rungs.length).toBeGreaterThanOrEqual(3)
    expect(props.onLadder.mock.calls[0]?.[0].done).toBe(0)
  })

  // A stored chain is resumed rather than regenerated. Coming back to different words for
  // the step you had already decided to do is a small betrayal of the person who came back.
  it('does not regenerate a chain it was given', async () => {
    renderPage()
    await screen.findByText('Write the title.')

    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  // A stuck person does not need an error dialog, and the rule chain is a genuine answer.
  it('never shows an error when the model cannot be reached', async () => {
    renderPage({ ladder: null })

    expect(await screen.findByTestId('rung-action')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('offers to finish the block once the chain runs out', async () => {
    const props = renderPage({ ladder: { ...ladder, done: 3 } })

    await userEvent.click(await screen.findByRole('button', { name: /mark it done/i }))

    expect(props.onDone).toHaveBeenCalledWith('b1')
  })

  it('does not offer another step once the chain runs out', async () => {
    renderPage({ ladder: { ...ladder, done: 3 } })

    await screen.findByTestId('ladder-finished')
    expect(screen.queryByRole('button', { name: /next step/i })).not.toBeInTheDocument()
  })

  // Leaving is not failing, and the copy must not suggest it is.
  it('leaves without losing where the student got to', async () => {
    const props = renderPage()
    await screen.findByText('Write the title.')

    await userEvent.click(screen.getByRole('button', { name: /stop here/i }))

    expect(props.onBack).toHaveBeenCalled()
    expect(props.onLadder).not.toHaveBeenCalled()
  })

  // Offline the re-roll has nothing new to offer, so it is not shown at all rather than
  // being shown and doing nothing.
  it('does not offer a re-roll it cannot honour', async () => {
    renderPage({ ladder: null })
    await screen.findByTestId('rung-action')

    expect(screen.queryByRole('button', { name: /doesn.t fit/i })).not.toBeInTheDocument()
  })

  // The offer has to survive a reload. It was held in state, so it appeared on the visit
  // that generated the chain and was gone on the next one, for no reason a student could see.
  it('offers the re-roll on a stored chain a model wrote', async () => {
    renderPage({ ladder: { ...ladder, fromModel: true } })

    expect(await screen.findByRole('button', { name: /doesn.t fit/i })).toBeInTheDocument()
  })

  it('offers no re-roll on a stored chain the rules wrote', async () => {
    renderPage({ ladder: { ...ladder, fromModel: false } })

    await screen.findByTestId('rung-action')
    expect(screen.queryByRole('button', { name: /doesn.t fit/i })).not.toBeInTheDocument()
  })

  it('offers a re-roll when the chain came from the model', async () => {
    vi.mocked(fetch).mockResolvedValue(modelReply)

    renderPage({ ladder: null })

    expect(await screen.findByRole('button', { name: /doesn.t fit/i })).toBeInTheDocument()
  })

  it('swaps the rung the student rejected without moving the count', async () => {
    vi.mocked(fetch).mockResolvedValue(modelReply)
    const props = renderPage({ ladder: null })
    await screen.findByRole('button', { name: /doesn.t fit/i })

    // The replacement is the first step of whatever the endpoint answers with next.
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        steps: [
          { action: 'Read the question once.', minutes: 2 },
          { action: 'Write its title.', minutes: 3 },
          { action: 'Write one bad sentence.', minutes: 5 },
        ],
      }),
    } as unknown as Response)

    await userEvent.click(screen.getByRole('button', { name: /doesn.t fit/i }))

    expect(await screen.findByText('Read the question once.')).toBeInTheDocument()
    expect(props.onLadder).toHaveBeenLastCalledWith(expect.objectContaining({ done: 0 }))
    expect(screen.getByTestId('ladder-progress')).toHaveTextContent('Step 1 of 3')
  })

  // Pressing it twice while the first call is in flight would ask for two replacements and
  // apply whichever landed last.
  it('does not let a second re-roll start while the first is in flight', async () => {
    vi.mocked(fetch).mockResolvedValue(modelReply)
    renderPage({ ladder: null })
    const reroll = await screen.findByRole('button', { name: /doesn.t fit/i })

    vi.mocked(fetch).mockImplementation(() => new Promise(() => undefined))
    await userEvent.click(reroll)

    expect(reroll).toBeDisabled()
  })

  it('names the block it is about', async () => {
    renderPage()

    expect(await screen.findByText('Ethics essay')).toBeInTheDocument()
  })
})

/**
 * The page must never be able to sit on "Working out where to start." for good.
 *
 * The generator was a bare `.then()` chain with no `.catch()`, so anything that *rejected*
 * -- the dynamic `import('../../ai')` failing, a chunk served as HTML by a stale service
 * worker, a browser offline mid-load -- left `open` null for the lifetime of the page. The
 * sheet then showed a student who cannot start a task a sentence about working out where to
 * start, with no steps under it and nothing to press.
 *
 * The rule chain needs no network at all, so there is no failure worth showing instead of
 * it.
 *
 * In its own block with its own module registry: `vi.doMock` rewrites what a later dynamic
 * import resolves to, and left in place it answered for every other test in this file.
 */
describe('when the chain generator cannot even be loaded', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    vi.resetModules()
    vi.doMock('../../ai', () => {
      throw new Error('chunk failed to load')
    })
  })

  afterEach(() => {
    vi.doUnmock('../../ai')
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('still shows a step rather than working it out for ever', async () => {
    const { MicroStartPage: Page } = await import('./MicroStartPage')

    render(
      <Page
        item={item}
        ladder={null}
        onLadder={vi.fn()}
        onDone={vi.fn()}
        onBack={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByTestId('rung-action')).toBeInTheDocument()
    expect(screen.queryByTestId('ladder-working')).toBeNull()
  })
})
