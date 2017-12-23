import Bucket, {BucketCategory} from './Bucket'
import Metrics from './Metrics'

export interface IBucketListOptions {
  windowDuration: number,
  numBuckets: number
}

export {BucketCategory}

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

  public increaseBucketValue (category: BucketCategory) {
    const bucket = this.currentBucket
    switch (category) {
      case BucketCategory.Failures:
        bucket.failures += 1
        break
      case BucketCategory.ShortCircuits:
        bucket.shortCircuits += 1
        break
      case BucketCategory.Successes:
        bucket.successes += 1
        break
      case BucketCategory.Timeouts:
        bucket.timeouts += 1
        break
    }
  }

  public collectRuntime (runtime: number) {
    this.currentBucket.runTimes.push(runtime)
    this.onNewRuntimeCollected()
  }

  public getMetrics (): Metrics {
    return this.buckets.reduce((metrics, bucket) => metrics.involve(bucket), new Metrics())
  }

  public getSortedRuntimes (): number[] {
    return this.buckets
      .reduce((logs: number[], bucket) => logs.concat(bucket.runTimes), [])
      .sort((x, y) => x - y)
  }
}
