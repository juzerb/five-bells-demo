#!/usr/bin/env node
'use strict'

const co = require('co')
const request = require('co-request')
const Pathfinder = require('five-bells-sender/node_modules/five-bells-pathfind').Pathfinder

const pathfinder = new Pathfinder({
  crawler: {
    initialNodes: ['http://localhost:3001', 'http://localhost:3002']
  }
})

co(function * () {
  yield pathfinder.crawl()
  let ledgers = yield pathfinder.getLedgers()
  console.log('Ledger\tAccount\tBalance')
  for (let ledger of ledgers) {
    let accounts = yield request(ledger.id + '/accounts', {json: true})
    for (let account of accounts.body) {
      console.log(
        getPort(ledger.id) + '\t' +
        getName(account.id) + '\t' +
        account.balance)
    }
  }
}).catch(function (err) {
  console.error(err.stack)
  process.exit(1)
})

function getPort (path) {
  return /:(\d+)/.exec(path)[1]
}

function getName (path) {
  let parts = path.split('/')
  return parts[parts.length - 1]
}
