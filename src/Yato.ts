/// <reference types="node" />
import {EventEmitter} from 'events'
import BucketList, {Bucket, IBucketListOptions} from './BucketList'
import Metrics from './BucketList/Metrics'
import StateManager, {IStateManagerOptions, State} from './StateManager'
import {Command, executeCommand} from './utils'

export type FallbackFunction = () => any

const DEFAULT_OPTIONS = {
  errorThreshold: 50, // percentage
  numBuckets: 10, // number
  timeoutDuration: 3000, // ms
  volumeThreshold: 5, // 超过这个量的请求数量，bucket 数据才有意义
  windowDuration: 10000 // ms
}

export interface IYatoOptions extends IBucketListOptions, IStateManagerOptions {
  timeoutDuration: number
}

export {State}

export interface IStats extends Metrics {
  latencyMean: number,
  percentiles: {[key: string]: number},
  responseTime: number,
  state: State
}

export default class Yato extends EventEmitter {
  private bucketList: BucketList
  private stateManager: StateManager
  private timeoutDuration: number

  constructor (options = {}) {
    super()

    const yatoOptions: IYatoOptions = Object.assign({}, DEFAULT_OPTIONS, options)

    this.stateManager = new StateManager(this, {
      errorThreshold: yatoOptions.errorThreshold,
      volumeThreshold: yatoOptions.volumeThreshold,
      windowDuration: yatoOptions.windowDuration
    })
    this.bucketList = new BucketList({
      numBuckets: yatoOptions.numBuckets,
      windowDuration: yatoOptions.windowDuration
    }, () => {
      this.stateManager.updateState(this.bucketList)
      if (this.listenerCount('collect') > 0) {
        this.emit('collect', this.getStats())
      }
    })
  }

  /**
   * Run a command
   *
   * @param {Command} command
   * @param {FallbackFunction} [fallback]
   * @returns {Promise<any>}
   * @memberof Yato
   * @example
   * const Redis = require('ioredis')
   * const redis = new Redis()
   * yato.run(() => redis.get('foo'), () => 'bar')
   */
  public run (command: Command, fallback?: FallbackFunction): Promise<any> {
    const fallbackContainer = createFallbackContainer(fallback)
    if (!this.isOpen()) {
      // 非关闭状态，执行请求，并将其执行状况记录到最后一个 bucket 里
      return executeCommand(command, this.bucketList, this.timeoutDuration)
        // 如果超时或者响应失败，执行 fallback
        .catch((error: Error) => fallbackContainer() || Promise.reject(error))
    }
    this.currentBucket.shortCircuits += 1

    return fallbackContainer() || Promise.reject(new Error('Bad Request!'))
  }

  get currentBucket (): Bucket {
    return this.bucketList.currentBucket
  }

  /**
   * Get the state of the circuit breaker
   *
   * @returns {State}
   * @memberof Yato
   */
  public getState (): State {
    return this.stateManager.getState()
  }

  /**
   * Whether the circuit breaker is open
   *
   * @returns {boolean}
   * @memberof Yato
   */
  public isOpen (): boolean {
    return this.getState() === State.Open
  }

  public getStats (): IStats {
    return generateStats(this.stateManager.getState(), this.bucketList)
  }
}

function generateStats (state: State, bucketList: BucketList): IStats {
  const latencyLog = bucketList.getSortedRuntimes()
  const metrics = bucketList.getMetrics()

  const percentiles: {[key: string]: number} = {
    25: 0,
    50: 0,
    75: 0,
    90: 0,
    95: 0,
    99: 0,
    99.5: 0,
    100: 0
  }
  Object.keys(percentiles).forEach((key) => {
    const index = Math.floor(latencyLog.length / 100 * Number(key)) - 1
    if (index < 0) {
      delete percentiles[key]
    } else {
      percentiles[key] = latencyLog[index]
    }
  })

  return Object.assign(metrics, {
    latencyMean: latencyLog.reduce((x, y) => x + y, 0) / (latencyLog.length || 1),
    percentiles,
    responseTime: bucketList.latestResponseTime,
    state
  })
}

const createFallbackContainer = (fallback?: FallbackFunction) => (): Promise<any> | false => {
  if (fallback) {
    return Promise.resolve(fallback())
  }
  return false
}
