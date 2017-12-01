const OPEN = 0
const HALF_OPEN = 1
const CLOSED = 2

const createBucket = () => ({
  failures: 0,
  successes: 0,
  timeouts: 0,
  shortCircuits: 0
})

const createState = (opts = {}) => {
  let s = CLOSED
  // open 的标准
  const { errorThreshold, volumeThreshold, onClosed, onOpen } = opts

  return {
    isOpen () {
      return s === OPEN
    },
    // OPEN -> HALF_OPEN
    openHalf () {
      this.updateState(HALF_OPEN)
    },
    getState () {
      return s
    },
    // HALF_OPEN -> OPEN/CLOSED  CLOSED -> OPEN  OPEN -> HALF_OPEN
    updateState (buckets) {
      // OPEN -> HALF_OPEN
      if (s === OPEN && buckets === HALF_OPEN) {
        s = HALF_OPEN
        return
      }
      const metrics = calculateMetrics(buckets)

      // HALF_OPEN -> OPEN/CLOSED
      if (s === HALF_OPEN) {
        // 最后一个 bucket 是否失败: 没有成功且有失败，则为失败。只要有成功就算成功
        const lastCommandFailed = !buckets[buckets.length - 1].successes && metrics.errorCount > 0

        if (lastCommandFailed) {
          s = OPEN
        } else {
          s = CLOSED
          // 触发关闭回调
          onClosed && onClosed(metrics)
        }
      } else if (s === CLOSED) {
        // CLOSED -> OPEN
        // 超过 error 阈值
        const overErrorThreshold = metrics.getErrorPercentage() > errorThreshold
        // 超过指定请求数
        const overVolumeThreshold = metrics.totalCount > volumeThreshold
        // 只有超过指定请求数，error 阈值才有意义
        const overThreshold = overVolumeThreshold && overErrorThreshold

        if (overThreshold) {
          s = OPEN
          setTimeout(() => {
            this.isOpen() && this.openHalf()
          }, opts.windowDuration)
          // 触发开启回调
          onOpen && onOpen(metrics)
        }
      }
    }
  }
}

const calculateMetrics = buckets => buckets.reduce((result, bucket) => {
  const errors = bucket.failures + bucket.timeouts
  result.errorCount += errors
  result.totalCount += (errors + bucket.successes)
  return result
}, {
  totalCount: 0,
  errorCount: 0,
  getErrorPercentage () {
    return (this.errorCount / (this.totalCount > 0 ? this.totalCount : 1)) * 100
  }
})

const startTicker = (buckets = [], opts = {}) => {
  const bucketDuration = opts.windowDuration / opts.numBuckets
  return setInterval(() => {
    if (buckets.length > opts.numBuckets) {
      buckets.shift()
    }
    // 每 bucketDuration ms 一个 bucket
    buckets.push(createBucket())
  }, bucketDuration)
}

const stateExecuteCommand = (s, timeoutDuration) => (command, buckets) => {
  const increment = prop => {
    buckets[buckets.length - 1][prop]++
    s.updateState(buckets)
  }
  const commandPromise = command()
  const timeoutPromise = new Promise(resolve => {
    setTimeout(() => resolve('request timeout'), timeoutDuration)
  })

  // command 和 timeout 竞争
  return Promise.race([
    commandPromise,
    timeoutPromise
  ]).then(data => {
    if (data === 'request timeout') {
      // 记录超时情况，成功或者失败的情况在超时时间之内返回，则不记录超时
      increment('timeouts')
      return commandPromise
    }
    // 记录成功
    increment('successes')
    return data
  }).catch(error => {
    // 记录失败
    increment('failures')
    return Promise.reject(error)
  })
}

class Hystrix {
  constructor (opts = {}) {
    this.opts = opts
    // 初始化
    this.opts.windowDuration = opts.windowDuration || 10000 // ms
    this.opts.numBuckets = opts.numBuckets || 10 // number
    this.opts.timeoutDuration = opts.timeoutDuration || 3000 // ms
    this.opts.errorThreshold = opts.errorThreshold || 50 // percentage
    this.opts.volumeThreshold = opts.volumeThreshold || 5 // 超过这个量的请求数量，bucket 数据才有意义

    this._buckets = [createBucket()]

    // 启动轮询
    this._state = createState(this.opts)
    this._ticker = startTicker(this._buckets, this.opts, this._state)
    this._executeCommand = stateExecuteCommand(this._state, this.opts.timeoutDuration)
  }
  run (command, fallback) {
    const curBucket = this._buckets[this._buckets.length - 1]
    if (!this._state.isOpen()) {
      // 非关闭状态，执行请求，并将其执行状况记录到最后一个 bucket 里
      return this._executeCommand(command, this._buckets)
    }
    curBucket.shortCircuits++
    if (fallback) {
      return fallback()
    }
    throw new Error('Bad Request!')
  }
  isOpen () {
    return this._state.isOpen()
  }
}

module.exports = Hystrix
