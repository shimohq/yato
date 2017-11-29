# shimo-hystrix
石墨服务断路器

## Install

```JavaScript
npm install shimo-hystrix
```

## Usage

```JavaScript
const Hystrix = require('shimo-hystrix')
const hystrix = new Hystrix()

hystrix
  .run(() => Promise.reslove(1))
  .then(data => data === 1) // true
```

## API

### run(command, [fallback])

run 函数接受两个参数，第一个参数是要监控的指令，第二个参数时当断路器打开时需要执行的回退操作。

command 是一个会返回 Promise 的回调函数，在断路器处于非打开状态时，run 函数会返回 command 执行产生的 Promise。

### isOpen()

返回当前断路器是否处于打开状态

## Config

### windowDuration

这个配置十分重要，它决定着一个 bucket 可以存在多久，以及断路器打开多久后切换为半打开状态

默认值为 10000，哦对了，这个值的单位是 ms

### numBuckets

最多可以存在多少 bucket

默认值为 10

根据 windowDuration 和 numBuckets 可以计算出每隔多久应该产生一个 bucket

### timeoutDuration

多久没响应算超时

默认值为 3000，单位也是 ms
