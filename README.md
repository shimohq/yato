# yato

[![Build Status](https://travis-ci.org/shimohq/shimo-hystrix.svg?branch=master)](https://travis-ci.org/shimohq/shimo-hystrix)

A node module similar to hystrix. Who caused riots - cut it!

## Install

```JavaScript
npm install yato
```

## Usage

```JavaScript
const Yato = require('yato')
const yato = new Yato({
 // config...
})

yato
  .run(() => Promise.reslove(1))
  .then(data => data === 1) // true
```

## API

#### run(command, [fallback])

run 函数接受两个参数，第一个参数是要监控的指令，第二个参数是请求失败时需要执行的回退操作。

command 是一个会返回 Promise 的回调函数，在断路器处于非打开状态时，run 函数会返回 command 执行产生的 Promise。

#### isOpen()

返回当前断路器是否处于打开状态

#### getStats()

计算并返回当前的统计数据。

```JSON
{
  "state": "OPEN",
  "latencyMean": 560,
  "percentiles": {
    "25": 200,
    "50": 200,
    "75": 300,
    "90": 500,
    "95": 500,
    "99.5": 500,
    "100": 3000
  },
  "totalCount": 10,
  "errorCount": 7,
  "failures": 6,
  "timeouts": 1,
  "successes": 3,
  "shortCircuits": 0,
  "errorPercentage": 70
}
```
state -> 表示断路器当前的状态，可能值为: "OPEN", "HALF_OPEN", "CLOSED"

latencyMean -> 平均响应时间 = 总响应时间 / 总请求数

percentiles -> 响应时间百分比，抽取了几个关键数据，上面的例子中表示，50% 的请求延迟在 200ms 以下，75% 的请求延迟在 300ms 以下， 99.5% 的请求延迟在 500ms 以下。总共请求了 10 次的话可以得出，有 5 次请求在 200 ms 以下，有两次在 200 ~ 300ms 之间，有两次在 300ms ~ 500ms 之间，有一次超时请求用了 3000ms。

totalCount -> 总请求次数

errorCount -> 总失败次数 = failures + timeouts

failures -> 请求返回错误次数

timeouts -> 请求超时次数

successes -> 请求成功次数

shortCircuits -> 跳过请求直接返回失败或者 fallback 次数

errorPercentage -> 请求失败率 = errorCount / totalCount

## Events

Yato 支持订阅一些重要的事件:

 - open - 断路器被打开时触发
 - close - 断路器被关闭时触发
 - halfOpen - 断路器切换到半打开状态时触发
 - collect - 订阅此事件用来收集统计数据
 
 ```JavaScript
   yato.on('open', metrics => {
     // metrics: { totalCount, errorCount, failures, successes, timeouts, shortCircuits, errorPercentage }
     console.log(metrics)
   })
   
   yato.on('close', () => {
     console.log('close')
   })
   
   yato.on('halfOpen', () => {
     console.log('halfOpen')
   })
   
   yato.on('collect', stats => {
     // same as getStats API's return.
     console.log(stats)
   })
 ```

## Config

#### windowDuration

这个配置十分重要，它决定着一个 bucket 可以存在多久，以及断路器打开多久后切换为半打开状态

默认值为 10000，哦对了，这个值的单位是 ms

#### numBuckets

最多可以存在多少 bucket

默认值为 10

根据 windowDuration 和 numBuckets 可以计算出每隔多久应该产生一个 bucket

#### timeoutDuration

多久没响应算超时

默认值为 3000，单位也是 ms

#### errorThreshold

错误率阈值。

出错次数 = 响应出错次数 + 响应超时次数

错误率 = (出错次数 / 请求总次数) * 100

Yato 会在每个请求结束或者超时后，更新断路器的状态，指标之一就是错误率，一旦错误率高于指定的阈值，断路器就会被打开。

默认值为 50

#### volumeThreshold

请求量阈值。

比如某段时间内，只有一个请求，且这个请求失败或者超时了，我们不希望这个时候就判定该服务 100% 不健康，因此设定了这个选项，只有总请求次数超过了这个值，我们统计的错误率才有意义。

默认值为 5

## 关于断路器

buckets => 每隔固定时间产生一个 bucket，每个 bucket 记录这段时间内所有请求的状态, buckets 数量有上限，达到上限后要将最早的 bucket 扔掉

bucket 的产生 => 每隔一段时间产生一个 bucket

state => OPEN / HALF_OPEN / CLOSED

默认状态是 CLOSED，也就是断路器处于关闭状态，请求能够在客户端和服务之间正常传递

每产生一个请求，将请求的情况记录到当前时间所处的 bucket 中，并根据所有的 bucket 的记录计算出服务当前的健康状况，健康状况可以根据不同服务进行配置，默认失败超过请求总量的 50%，会触发断路器打开 —— OPEN，之后的请求看到断路器处于 OPEN 状态，直接返回失败，不再向不健康的服务发送请求，以免其更加不健康。

在断路器开启 OPEN 状态时，启动计时器，根据配置，等待一段时间后，将状态变更为 HALF_OPEN，并允许请求通过，请求结束后根据请求情况更新断路器状态 —— 如果请求失败，则继续 OPEN，再次出发计时器；如果请求成功，变更状态为 CLOSED

## Thanks For

https://github.com/Netflix/Hystrix

https://github.com/yammer/circuit-breaker-js

## License

MIT
