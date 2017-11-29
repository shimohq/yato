const test = require('ava')
const Hystrix = require('../hystrix')

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
  const bucket = hystrix._buckets[hystrix._buckets.length - 1]
  t.is(result, true, 'should get command result when command is timeout')
  t.is(bucket.timeouts, 1, 'should record a timeout if not a success or failure')
  t.is(hystrix._buckets.reduce((result, item) => result + item.successes, 0), 0, 'should not record a success when there is a timeout')
})

test('With a broken service', async t => {
  const hystrix = new Hystrix()
  t.is(hystrix.isOpen(), false)
  await Promise.all([
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand),
    hystrix.run(timeoutCommand)
  ])
  t.is(hystrix.isOpen(), false)
  await hystrix.run(timeoutCommand)
  t.is(hystrix.isOpen(), true)
  try {
    await hystrix.run(timeoutCommand)
    t.fail('should not run the command')
  } catch (error) {
    t.is(error.message, '请求失败')
    t.is(hystrix._buckets[hystrix._buckets.length - 1].shortCircuits, 1)
  }

  let count = 0
  const fallback = () => count++
  try {
    await hystrix.run(timeoutCommand, fallback)
  } catch (error) {
    t.is(count, 1)
  }
})
