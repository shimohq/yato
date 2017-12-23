/// <reference types="node" />
import {EventEmitter} from 'events'
import BucketList, {BucketListOptions} from './BucketList'
import StateManager, {StateManagerOptions, State} from './StateManager'
import {executeCommand, Command} from './utils'

export type FallbackFunction = () => any

const DEFAULT_OPTIONS = {
  windowDuration: 10000, // ms
  numBuckets: 10, // number
  timeoutDuration: 3000, // ms
  errorThreshold: 50, // percentage
  volumeThreshold: 5 // 超过这个量的请求数量，bucket 数据才有意义
}

export interface YatoOptions extends BucketListOptions, StateManagerOptions {
  timeoutDuration: number
}

export {State}

export default class Yato extends EventEmitter {
  private _buckets: BucketList
  private _stateManager: StateManager
  private _timeoutDuration: number

  constructor (options = {}) {
    super()

    const yatoOptions: YatoOptions = Object.assign({}, DEFAULT_OPTIONS, options)

    this._stateManager = new StateManager(this, {
      windowDuration: yatoOptions.windowDuration,
      volumeThreshold: yatoOptions.volumeThreshold,
      errorThreshold: yatoOptions.errorThreshold
    })
    this._buckets = new BucketList({
      windowDuration: yatoOptions.windowDuration,
      numBuckets: yatoOptions.numBuckets
    }, () => {
      this._stateManager.updateState(this._buckets)
      if (this.listenerCount('collect') > 0) {
        this.emit('collect', this.getStats())
      }
    })
  }

  run (command: Command, fallback?: FallbackFunction) {
    const fallbackContainer = createFallbackContainer(fallback)
    if (!this._stateManager.isOpen()) {
      // 非关闭状态，执行请求，并将其执行状况记录到最后一个 bucket 里
      return executeCommand(command, this._buckets, this._timeoutDuration)
        // 如果超时或者响应失败，执行 fallback
        .catch((error: Error) => fallbackContainer() || Promise.reject(error))
    }
    this._buckets.currentBucket.shortCircuits += 1

    return fallbackContainer() || Promise.reject(new Error('Bad Request!'))
  }

  getState (): State {
    return this._stateManager.getState()
  }

  isOpen () {
    return this._stateManager.isOpen()
  }

  getStats (): object {
    return generateStats(this._stateManager.getState(), this._buckets)
  }
}

function generateStats (state: string, buckets: BucketList): object {
  const latencyLog = buckets.getSortedRuntimes()
  const metrics = buckets.getMetrics()

  const percentiles: {[key: string]: number} = {
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
    const index = Math.floor(latencyLog.length / 100 * Number(key)) - 1
    if (index < 0) {
      delete percentiles[key]
    } else {
      percentiles[key] = latencyLog[index]
    }
  })

  return Object.assign({
    state,
    latencyMean: latencyLog.reduce((x, y) => x + y, 0) / (latencyLog.length || 1),
    percentiles,
    responseTime: buckets.latestResponseTime
  }, metrics)
}

const createFallbackContainer = (fallback?: FallbackFunction) => (): Promise<any> | false => {
  if (fallback) {
    return Promise.resolve(fallback())
  }
  return false
}
