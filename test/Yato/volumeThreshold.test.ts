import test from 'ava'
import { last, noop, pick } from 'lodash'
import Yato from '../../src/Yato'
import { fail, success } from './command'

test('keeps closed when volumeThreshold not reached', async (t) => {
  const yato = new Yato({ volumeThreshold: 2 })

  await Promise.all([
    yato.run(fail).catch(noop),
    yato.run(fail).catch(noop)
  ])
  t.is(yato.isOpen(), false)

  await yato.run(fail).catch(noop)
  t.is(yato.isOpen(), true)
})
