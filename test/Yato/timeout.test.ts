import test from 'ava'
import Yato from '../../src/Yato'
import {timeout} from './command'

const timeoutDuration = 1

test('rejects when timed out', async t => {
  const yato = new Yato({timeoutDuration})

  await t.throws(yato.run(timeout), 'Timeout')
  t.is(yato.currentBucket.timeouts, 1)
  t.is(yato.currentBucket.failures, 0)
  t.is(yato.currentBucket.shortCircuits, 0)
  t.is(yato.currentBucket.successes, 0)
})

test('uses fallback to resolve', async t => {
  const ret = Symbol('fallback result')
  const fallback = () => ret

  const yato = new Yato({timeoutDuration})

  t.is(await yato.run(timeout, fallback), ret)

  t.is(yato.currentBucket.timeouts, 1)
  t.is(yato.currentBucket.failures, 0)
  t.is(yato.currentBucket.shortCircuits, 0)
  t.is(yato.currentBucket.successes, 0)
})
