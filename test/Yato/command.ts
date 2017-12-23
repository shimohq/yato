import {noop} from 'lodash'

export const fail = () => Promise.reject(new Error('reject'))
export const success = () => Promise.resolve('resolve')
export const timeout = () => new Promise(noop)