import test from 'ava'
import { last, noop, pick } from 'lodash'
import Yato, { State } from '../../src/Yato'
import { fail, success, timeout } from './command'

const timeoutDuration = 1

test('returns right stats data', async (t) => {
  const yato = new Yato({ timeoutDuration })

  await Promise.all([
    yato.run(success),
    yato.run(success),
    yato.run(fail).catch(noop),
    yato.run(fail).catch(noop),
    yato.run(timeout).catch(noop)
  ])

  const statsPromise = new Promise((resolve) => yato.on('collect', resolve))

  await yato.run(timeout).catch(noop)

  const should = {
    errorCount: 4,
    failures: 2,
    responseTime: last(yato.currentBucket.runTimes),
    shortCircuits: 0,
    state: State.Open,
    successes: 2,
    timeouts: 2,
    totalCount: 6
  }

  const stats = yato.getStats()
  t.deepEqual(await statsPromise, stats)
  t.deepEqual(pick(stats, Object.keys(should)), should)
  t.true(typeof stats.latencyMean === 'number')
  Object.values(stats.percentiles).forEach((value) => t.true(typeof value === 'number'))
})
