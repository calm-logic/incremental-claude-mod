import { expect, test } from 'claude-code/testing'

import { register } from './register'

for (const surface of ['terminal', 'desktop'] as const) {
  test(`/incremental shows the band on ${surface}`, async ($, on) => {
    register(on, {})
    await $.command.run({ command: 'incremental' })
    const band = await $.ui.mount({
      plugin: 'incremental',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false },
    })
    expect(await band.find({ key: 'row0' })).toBeDefined()
    await band.unmount()
  })
}
