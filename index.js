const OPEN = 0
const HALF_OPEN = 1
const CLOSED = 2

const stateMap = new Map()
stateMap.set(OPEN, 'OPEN')
stateMap.set(HALF_OPEN, 'HALF_OPEN')
stateMap.set(CLOSED, 'CLOSED')

const createBucket = () => ({
  failures: 0,
  successes: 0,
  timeouts: 0,
  shortCircuits: 0,
  runTimes: []
})

const createState = (opts = {}) => {
  let s = CLOSED
  // open 的标准
  const { errorThreshold, volumeThreshold, onClosed, onOpen, collectors } = opts

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
        const overErrorThreshold = metrics.errorPercentage > errorThreshold
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
      // 惰性收集请求状态数据
      collectors(() => generateStats(stateMap.get(s), metrics, buckets))
    }
  }
}

const calculateMetrics = buckets => buckets.reduce((result, bucket, index, array) => {
  const errors = bucket.failures + bucket.timeouts
  result.errorCount += errors
  result.totalCount += (errors + bucket.successes)
  result.failures += bucket.failures
  result.timeouts += bucket.timeouts
  result.successes += bucket.successes
  result.timeouts += bucket.shortCircuits
  if (index === array.length - 1) {
    result.errorPercentage = (result.errorCount / (result.totalCount > 0 ? result.totalCount : 1)) * 100
  }
  return result
}, {
  totalCount: 0,
  errorCount: 0,
  failures: 0,
  successes: 0,
  timeouts: 0,
  shortCircuits: 0,
  errorPercentage: 0
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
  const increment = (prop, runTime) => {
    const curBucket = buckets[buckets.length - 1]
    curBucket[prop]++
    runTime && curBucket.runTimes.push(runTime)
    s.updateState(buckets)
  }
  const startTime = Date.now()
  const commandPromise = command()
  const timeoutPromise = new Promise(resolve => {
    setTimeout(() => resolve('request timeout'), timeoutDuration)
  })
  const getRunTime = () => Date.now() - startTime

  // command 和 timeout 竞争
  return Promise.race([
    commandPromise,
    timeoutPromise
  ]).then(data => {
    if (data === 'request timeout') {
      // 记录超时情况，成功或者失败的情况在超时时间之内返回，则不记录超时
      increment('timeouts', getRunTime())
      return commandPromise
    }
    // 记录成功
    increment('successes', getRunTime())
    return data
  }).catch(error => {
    // 记录失败
    increment('failures', getRunTime())
    return Promise.reject(error)
  })
}

const collectData = (collectors = []) => {
  if (!Array.isArray(collectors)) {
    collectors = [collectors]
  }
  return getData => {
    const data = collectors.length > 0 && getData()
    return collectors.forEach(collector => {
      if (typeof collector !== 'function') {
        throw new Error('collector must be a function')
      }
      collector(data)
    })
  }
}

const generateStats = (state, metrics, buckets) => {
  const latencyLog = buckets
    .reduce((logs, bucket) => logs.concat(bucket.runTimes), [])
    .sort((x, y) => x - y)
  const percentiles = {
    '25': 0,
    '50': 0,
    '75': 0,
    '90': 0,
    '95': 0,
    '99': 0,
    '99.5': 0,
    '100': 0
  }
  Object.keys(percentiles).forEach(key => {
    const index = Math.floor(latencyLog.length / 100 * (+key)) - 1
    percentiles[key] = latencyLog[index]
  })
  return Object.assign({
    state,
    latencyMean: latencyLog.reduce((x, y) => x + y, 0) / (latencyLog.length || 1),
    percentiles
  }, metrics)
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
    this.opts.collectors = collectData(opts.collectors || [])

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
      const result = fallback()
      return Object.prototype.toString.call(result).slice(8, -1) === 'Promise' ? result : Promise.resolve(result)
    }
    throw new Error('Bad Request!')
  }
  isOpen () {
    return this._state.isOpen()
  }
  getStats () {
    return generateStats(stateMap.get(this._state.getState()), calculateMetrics(this._buckets), this._buckets)
  }
}

module.exports = Hystrix
