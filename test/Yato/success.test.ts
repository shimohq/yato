import test from 'ava'
import Yato from '../../src/Yato'

const ret = Symbol('a successful command')
const command = () => Promise.resolve(ret)

test('resolves when command successed', async (t) => {
  const yato = new Yato()
  t.is(await yato.run(command), ret)

  t.is(yato.currentBucket.successes, 1)
})

test('ignores fallback', async (t) => {
  const fallback = () => Symbol()
  const yato = new Yato()
  t.is(await yato.run(command, fallback), ret)

  t.is(yato.currentBucket.successes, 1)
})
