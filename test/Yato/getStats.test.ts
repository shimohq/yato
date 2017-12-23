import test from 'ava'
import Yato, {State} from '../../src/Yato'
import {noop, pick, last} from 'lodash'
import {success, fail, timeout} from './command'

const timeoutDuration = 1

test('returns right stats data', async t => {
    const yato = new Yato({timeoutDuration})

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
      state: State.Open,
      totalCount: 6,
      errorCount: 4,
      failures: 2,
      successes: 2,
      timeouts: 2,
      shortCircuits: 0,
      responseTime: last(yato.currentBucket.runTimes)
    }

    const stats = yato.getStats()
    t.deepEqual(await statsPromise, stats)
    t.deepEqual(pick(stats, Object.keys(should)), should)
    t.true(typeof stats.latencyMean === 'number')
    Object.values(stats.percentiles).forEach(value => t.true(typeof value === 'number'))
  })
