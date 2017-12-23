import test from 'ava'
import Yato from '../../src/Yato'

const error = new Error('a failed command')
const command = () => Promise.reject(error)

test('rejects when command failed', async (t) => {
  const yato = new Yato()
  await t.throws(yato.run(command))

  t.is(yato.currentBucket.failures, 1)
  t.is(yato.currentBucket.successes, 0)
  t.is(yato.currentBucket.shortCircuits, 0)
})

test('uses fallback to resolve', async (t) => {
  const ret = Symbol('fallback result')
  const fallback = () => ret

  const yato = new Yato()
  t.is(await yato.run(command, fallback), ret)

  t.is(yato.currentBucket.failures, 1)
  t.is(yato.currentBucket.successes, 0)
  t.is(yato.currentBucket.shortCircuits, 0)
})
