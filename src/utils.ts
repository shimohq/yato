import BucketList, {BucketCategory} from './BucketList'

const TIMEOUT_INDICATOR = 'request timeout'

export type Command = (...args: any[]) => Promise<any>
export function executeCommand (command: Command, bucketList: BucketList, timeoutDuration: number): any {
  const startTime = Date.now()
  const getRunTime = () => Date.now() - startTime

  const commandPromise = command()
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(resolve, timeoutDuration, TIMEOUT_INDICATOR)
  })

  // command 和 timeout 竞争
  return Promise.race([commandPromise, timeoutPromise]).then((data) => {
    if (data === TIMEOUT_INDICATOR) {
      // 记录超时情况，成功或者失败的情况在超时时间之内返回，则不记录超时
      bucketList.collect(BucketCategory.Timeouts, getRunTime())
      throw new Error('Timeout')
    }
    // 记录成功
    bucketList.collect(BucketCategory.Successes, getRunTime())
    return data
  }, (error) => {
    // 记录失败
    bucketList.collect(BucketCategory.Failures, getRunTime())
    throw error
  })
}
