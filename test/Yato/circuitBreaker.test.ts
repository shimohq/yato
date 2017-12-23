import test from 'ava'
import Yato, {State} from '../../src/Yato'
import {noop, pick, last} from 'lodash'
import {success, fail, timeout} from './command'
import isPromise = require('is-promise')

async function createdOpenYato (options: object = {}): Promise<Yato> {
  const yato = new Yato(Object.assign(options, {volumeThreshold: 0}))
  await yato.run(fail).catch(noop)
  if (!yato.isOpen()) {
    throw new Error('not open')
  }
  return yato
}

test('rejects with bad request', async t => {
  const yato = await createdOpenYato()

  await t.throws(yato.run(fail), 'Bad Request!')
  t.is(yato.currentBucket.shortCircuits, 1)
})

test('resolves with fallback when breaker is open', async t => {
  const yato = await createdOpenYato()

  const ret = Symbol('fallback')
  const runResult = yato.run(fail, () => ret)
  t.true(isPromise(runResult))
  t.is(await runResult, ret)
  t.is(yato.currentBucket.shortCircuits, 1)
})

test('switches to halfOpen after windowDuration', async t => {
  const yato = await createdOpenYato({windowDuration: 1})
  await new Promise((resolve) => yato.once('halfOpen', resolve))

  t.is(yato.getState(), State.HalfOpen)
})

test('halfOpen -> open when fails', async t => {
  const yato = await createdOpenYato({windowDuration: 1})
  await new Promise((resolve) => yato.once('halfOpen', resolve))

  await yato.run(fail).catch(noop)
  t.is(yato.getState(), State.Open)
  t.true(yato.isOpen())
})

test('halfOpen -> close when successes', async t => {
  const yato = await createdOpenYato({windowDuration: 1})
  await new Promise((resolve) => yato.once('halfOpen', resolve))

  await yato.run(success)
  t.is(yato.getState(), State.Closed)
  t.false(yato.isOpen())
})
