import test from 'ava'
import {noop} from 'lodash'
import Yato from '../../src/Yato'
import {fail, success} from './command'

test('isOpen is false when errors are below the errorThreshold', async (t) => {
  const yato = new Yato({
    errorThreshold: 75
  })
  await Promise.all([
    yato.run(fail).catch(noop),
    yato.run(fail).catch(noop),
    yato.run(success),
    yato.run(success),
    yato.run(success),
    yato.run(success),
    yato.run(success),
    yato.run(success)
  ])

  t.false(yato.isOpen())
})

test('isOpen is true when errors exceed errorThreshold', async (t) => {
  const yato = new Yato({
    errorThreshold: 75
  })
  await Promise.all([
    yato.run(fail).catch(noop),
    yato.run(fail).catch(noop),
    yato.run(fail).catch(noop),
    yato.run(fail).catch(noop),
    yato.run(fail).catch(noop),
    yato.run(fail).catch(noop),
    yato.run(fail).catch(noop),
    yato.run(fail).catch(noop),
    yato.run(success),
    yato.run(success)
  ])

  t.true(yato.isOpen())
})
