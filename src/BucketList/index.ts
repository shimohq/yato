import Bucket, {BucketCategory} from './Bucket'
import Metrics, {calculateMetrics} from './Metrics'

export interface IBucketListOptions {
  windowDuration: number,
  numBuckets: number
}

export {BucketCategory, Bucket}

export default class BucketList {
  private buckets: Bucket[] = [new Bucket()]
  constructor (options: IBucketListOptions, private onNewRuntimeCollected: () => void) {
    if (options.numBuckets <= 0) {
      throw new Error(`Expect "numBuckets" to be positive, got ${options.numBuckets}`)
    }

    const bucketDuration = options.windowDuration / options.numBuckets
    setInterval(() => {
      this.buckets.push(new Bucket())

      if (this.buckets.length > options.numBuckets) {
        this.buckets.shift()
      }
    }, bucketDuration)
  }

  get currentBucket (): Bucket {
    return this.buckets[this.buckets.length - 1]
  }

  get latestResponseTime (): number {
    const {runTimes} = this.currentBucket
    return runTimes.length === 0 ? 0 : runTimes[runTimes.length - 1]
  }

  /**
   * Collect the result of a request
   *
   * @param {BucketCategory} category the category of the result
   * @param {number} runtime the runtime of the result
   * @memberof BucketList
   */
  public collect (category: BucketCategory, runtime: number): void {
    const {currentBucket, onNewRuntimeCollected} = this
    currentBucket.increaseValue(category)
    currentBucket.runTimes.push(runtime)
    onNewRuntimeCollected()
  }

  public getMetrics (): Metrics {
    return calculateMetrics(this.buckets)
  }

  public getSortedRuntimes (): number[] {
    return this.buckets
      .reduce((logs: number[], bucket) => logs.concat(bucket.runTimes), [])
      .sort((x, y) => x - y)
  }
}
