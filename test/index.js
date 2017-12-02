const test = require('ava')
const Hystrix = require('../')
const _ = require('lodash')

const OPEN = 0
const HALF_OPEN = 1
const CLOSED = 2

const timeoutCommand = () => new Promise(resolve => {
  // 先发请求再发超时，因此要验证这一项要比超时时间更长才行
  setTimeout(() => resolve(true), 3001)
})

const success = () => Promise.resolve(true)
const fail = () => Promise.reject(new Error('error'))

test('With a working service', async t => {
  const hystrix = new Hystrix()
  const result = await hystrix.run(success)
  t.is(result, true, 'should run the command')

  const bucket = hystrix._buckets[hystrix._buckets.length - 1]
  t.is(bucket.successes, 1, 'should notify the hystrix if the command was successful')

  try {
    await hystrix.run(fail)
  } catch (err) {
    t.is(err.message, 'error', 'the error can be catched')
    const curBucket = hystrix._buckets[hystrix._buckets.length - 1]
    t.is(curBucket.failures, 1, 'should notify the hystrix if the command was fail')
  }
})

test('With timeout command', async t => {
  const hystrix = new Hystrix()
  const result = await hystrix.run(timeoutCommand)
  const buckets = hystrix._buckets
  t.is(result, true, 'should get command result when command is timeout')
  t.is(buckets.reduce((result, bucket) => result + bucket.timeouts, 0), 1, 'should record a timeout if not a success or failure')
  t.is(hystrix._buckets.reduce((result, item) => result + item.successes, 0), 0, 'should not record a success when there is a timeout')
})

test('With a broken service', async t => {
  let closedEvent = false
  const hystrix = new Hystrix({
    onClosed (metrics) {
      closedEvent = true
    }
  })
  // timeout 导致的 OPEN
  t.is(hystrix.isOpen(), false)
  // 100% 错误, 但是低于要求的衡量请求数
  await Promise.all([
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand)
  ])
  t.is(hystrix.isOpen(), false, 'isOpen should be false if requests are below the volumeThreshold')
  await hystrix.run(timeoutCommand)
  t.is(hystrix.isOpen(), true, 'isOpen should be true if requests are above the volumeThreshold')

  await t.throws(hystrix.run(timeoutCommand), 'Bad Request!')
  t.is(hystrix._buckets[hystrix._buckets.length - 1].shortCircuits, 1, 'should record a short circuit')

  const fallback = () => 1
  const count = await hystrix.run(timeoutCommand, fallback)
  t.is(count, 1, 'should run the fallback and return its result if one is provided')

  // 一段时间后切换到 HALF_OPEN
  t.is(hystrix._state.getState(), OPEN)
  await new Promise(resolve => {
    setTimeout(() => {
      t.is(hystrix._state.getState(), HALF_OPEN, 'should switch to HALF_OPEN')
      resolve()
    }, 10000)
  })
  // 请求成功，切换到 CLOSED
  t.is(closedEvent, false)
  await hystrix.run(success)
  t.is(closedEvent, true)
  t.is(hystrix._state.getState(), CLOSED, 'should switch to CLOSED')

  t.is(hystrix.isOpen(), false)
  // 产生 OPEN 状态
  await Promise.all([
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand)
  ])
  t.is(hystrix.isOpen(), true)

  await new Promise(resolve => {
    setTimeout(() => {
      t.is(hystrix._state.getState(), HALF_OPEN, 'should switch to HALF_OPEN')
      resolve()
    }, 10000)
  })
  // 请求失败, 切换到 OPEN
  try {
    await hystrix.run(fail)
  } catch (error) {
    t.is(hystrix._state.getState(), OPEN, 'should switch to OPEN')
  }
})

test('isOpen should be true if errors are below the errorThreshold', async t => {
  const hystrix = new Hystrix({
    errorThreshold: 75
  })
  await Promise.all([
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(success),
    hystrix.run(success),
    hystrix.run(success),
    hystrix.run(success),
    hystrix.run(success),
    hystrix.run(success)
  ])
  t.is(hystrix.isOpen(), false)
})

test('isOpen should be false if errors are above the errorThreshold', async t => {
  const hystrix = new Hystrix({
    errorThreshold: 75
  })
  await Promise.all([
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(success),
    hystrix.run(success)
  ])
  t.is(hystrix.isOpen(), true)
})

test('timeouts metrics === failures metrics', async t => {
  const metricsList = []
  const timeoutHystrix = new Hystrix({
    onOpen (metrics) {
      metricsList.push(metrics)
    }
  })
  await Promise.all([
    timeoutHystrix.run(timeoutCommand),
    timeoutHystrix.run(timeoutCommand),
    timeoutHystrix.run(timeoutCommand),
    timeoutHystrix.run(timeoutCommand),
    timeoutHystrix.run(timeoutCommand),
    timeoutHystrix.run(timeoutCommand)
  ])

  const failuresHystrix = new Hystrix({
    onOpen (metrics) {
      metricsList.push(metrics)
    }
  })
  await Promise.all([
    failuresHystrix.run(fail).catch(() => 'error'),
    failuresHystrix.run(fail).catch(() => 'error'),
    failuresHystrix.run(fail).catch(() => 'error'),
    failuresHystrix.run(fail).catch(() => 'error'),
    failuresHystrix.run(fail).catch(() => 'error'),
    failuresHystrix.run(fail).catch(() => 'error')
  ])
  t.is(metricsList[0].errorCount, metricsList[1].errorCount)
  t.is(metricsList[0].errorPercentage, metricsList[1].errorPercentage)
})

test('should get right stats data', async t => {
  let stats = {}
  const hystrix = new Hystrix({
    collectors: [data => (stats = data)]
  })
  await Promise.all([
    hystrix.run(success),
    hystrix.run(success),
    hystrix.run(fail).catch(() => 'error'),
    hystrix.run(fail).catch(() => 'error'),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(success),
    hystrix.run(fail).catch(() => 'error')
  ])
  const should = {
    state: 'OPEN',
    totalCount: 9,
    errorCount: 6,
    failures: 3,
    successes: 3,
    timeouts: 3,
    shortCircuits: 0,
    errorPercentage: (6 / 9) * 100
  }
  t.deepEqual(hystrix.getStats(), stats)
  t.deepEqual(_.pick(stats, ['state', 'totalCount', 'errorCount', 'failures', 'successes', 'timeouts', 'shortCircuits', 'errorPercentage']), should)
  t.true(_.isNumber(stats.latencyMean))
  Object.values(stats.percentiles).forEach(value => t.true(_.isNumber(value)))
})
