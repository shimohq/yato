const test = require('ava')
const Yato = require('../dist/index')
const _ = require('lodash')
const isPromise = require('is-promise')

const timeoutCommand = () => new Promise(resolve => {
  // 先发请求再发超时，因此要验证这一项要比超时时间更长才行
  setTimeout(() => resolve(true), 3001)
})

const success = () => Promise.resolve(true)
const fail = () => Promise.reject(new Error('error'))

test('With a working service', async t => {
  const yato = new Yato()
  const result = await yato.run(success)
  t.is(result, true, 'should run the command')

  t.is(yato._buckets.currentBucket.successes, 1, 'should notify the yato if the command was successful')

  try {
    await yato.run(fail)
  } catch (err) {
    t.is(err.message, 'error', 'the error can be catched')
    t.is(yato._buckets.currentBucket.failures, 1, 'should notify the yato if the command was fail')
  }
})

test('With timeout command', async t => {
  const yato = new Yato()
  const result = await yato.run(timeoutCommand, () => 1)
  t.is(result, 1, 'should get fallback result when command is timeout')
  const metrics = yato._buckets.getMetrics()
  t.is(metrics.timeouts, 1, 'should record a timeout if not a success or failure')
  t.is(metrics.successes, 0, 'should not record a success when there is a timeout')
})

test('With a broken service', async t => {
  const yato = new Yato()
  const closePromise = new Promise(resolve => {
    yato.on('close', () => resolve(true))
  })
  // timeout 导致的 OPEN
  t.is(yato.isOpen(), false)
  // 100% 错误, 但是低于要求的衡量请求数
  await Promise.all([
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1)
  ])
  t.is(yato.isOpen(), false, 'isOpen should be false if requests are below the volumeThreshold')
  await t.throws(yato.run(timeoutCommand), 'Timeout')
  t.is(yato.isOpen(), true, 'isOpen should be true if requests are above the volumeThreshold')

  await t.throws(yato.run(timeoutCommand), 'Bad Request!')
  t.is(yato._buckets.currentBucket.shortCircuits, 1, 'should record a short circuit')

  const fallback = () => 1
  const runResult = yato.run(timeoutCommand, fallback)
  t.true(isPromise(runResult), 'fallback result should be a Promise')
  const count = await runResult
  t.is(count, 1, 'should run the fallback and return its result if one is provided')

  // 一段时间后切换到 HALF_OPEN
  t.is(yato.getState(), Yato.State.Open)
  await new Promise(resolve => {
    setTimeout(() => {
      t.is(yato.getState(), Yato.State.HalfOpen, 'should switch to HALF_OPEN')
      resolve()
    }, 10000)
  })
  // 请求成功，切换到 CLOSED
  await yato.run(success)
  const close = await closePromise
  t.true(close)
  t.is(yato.getState(), Yato.State.Closed, 'should switch to CLOSED')

  t.is(yato.isOpen(), false)
  // 产生 OPEN 状态
  await Promise.all([
    yato.run(timeoutCommand, fallback),
    yato.run(timeoutCommand, fallback),
    yato.run(timeoutCommand, fallback),
    yato.run(timeoutCommand, fallback),
    yato.run(timeoutCommand, fallback),
    yato.run(timeoutCommand, fallback)
  ])
  t.is(yato.isOpen(), true)

  await new Promise(resolve => {
    setTimeout(() => {
      t.is(yato.getState(), Yato.State.HalfOpen, 'should switch to HALF_OPEN')
      resolve()
    }, 10000)
  })
  // 请求失败, 切换到 OPEN
  try {
    await yato.run(fail)
  } catch (error) {
    t.is(yato.getState(), Yato.State.Open, 'should switch to OPEN')
  }
})

test('isOpen should be false if errors are below the errorThreshold', async t => {
  const yato = new Yato({
    errorThreshold: 75
  })
  await Promise.all([
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1),
    yato.run(success),
    yato.run(success),
    yato.run(success),
    yato.run(success),
    yato.run(success),
    yato.run(success)
  ])
  t.is(yato.isOpen(), false)
})

test('isOpen should be true if errors are above the errorThreshold', async t => {
  const yato = new Yato({
    errorThreshold: 75
  })
  await Promise.all([
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1),
    yato.run(timeoutCommand, () => 1),
    yato.run(success),
    yato.run(success)
  ])
  t.is(yato.isOpen(), true)
})

test('timeouts metrics === failures metrics', async t => {
  const timeoutYato = new Yato()
  const metricsPromise1 = new Promise(resolve => {
    timeoutYato.on('open', metrics => {
      resolve(metrics)
    })
  })

  await Promise.all([
    timeoutYato.run(timeoutCommand, () => 1),
    timeoutYato.run(timeoutCommand, () => 1),
    timeoutYato.run(timeoutCommand, () => 1),
    timeoutYato.run(timeoutCommand, () => 1),
    timeoutYato.run(timeoutCommand, () => 1),
    timeoutYato.run(timeoutCommand, () => 1)
  ])
  const metrics1 = await metricsPromise1
  t.is(metrics1.errorCount, 6)
  t.is(metrics1.errorPercentage, 100)

  const failuresYato = new Yato()
  const metricsPromise2 = new Promise(resolve => {
    failuresYato.on('open', metrics => {
      resolve(metrics)
    })
  })

  await Promise.all([
    failuresYato.run(fail).catch(() => 'error'),
    failuresYato.run(fail).catch(() => 'error'),
    failuresYato.run(fail).catch(() => 'error'),
    failuresYato.run(fail).catch(() => 'error'),
    failuresYato.run(fail).catch(() => 'error'),
    failuresYato.run(fail).catch(() => 'error')
  ])
  const metrics2 = await metricsPromise2
  t.is(metrics2.errorCount, 6)
  t.is(metrics2.errorPercentage, 100)
})

test('should get right stats data', async t => {
  const yato = new Yato()
  await Promise.all([
    yato.run(success),
    yato.run(success),
    yato.run(fail).catch(() => 'error'),
    yato.run(fail).catch(() => 'error'),
    yato.run(timeoutCommand, () => 1)
  ])
  const statsPromise = new Promise(resolve => {
    yato.on('collect', data => {
      resolve(data)
    })
  })
  await yato.run(timeoutCommand, () => 1)
  const should = {
    state: 'open',
    totalCount: 6,
    errorCount: 4,
    failures: 2,
    successes: 2,
    timeouts: 2,
    shortCircuits: 0,
    responseTime: _.last(yato._buckets.currentBucket.runTimes) || 0
  }
  const stats = await statsPromise
  t.deepEqual(yato.getStats(), stats)
  t.deepEqual(_.pick(stats, ['state', 'totalCount', 'errorCount', 'failures', 'successes', 'timeouts', 'shortCircuits', 'errorPercentage', 'responseTime']), should)
  t.true(_.isNumber(stats.latencyMean))
  Object.values(stats.percentiles).forEach(value => t.true(_.isNumber(value)))
})
